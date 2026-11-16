// LIVE tier: `/transfer-session` in the real OpenCode 2 TUI, in a real
// pseudo-terminal, attached to an isolated host (private XDG dirs, never the
// user's opencode.db) with the plugin installed as in production. The real
// keymap, slash command, the plugin's own folder-browser dialog (its arrow keys
// through the host's modal keymap layers) and `session.move` run here; the
// result is read back from the real server.
import { afterAll, beforeAll, describe, expect, it } from "bun:test"
import { existsSync, realpathSync } from "node:fs"
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { rowText } from "@session-manager/infrastructure/adapters/inbound/tui/FolderBrowserDialogV2Adapter"
import { MODEL, startIsolatedHost, type IsolatedHost } from "@test/support/live/isolated-host"
import { requireOpenCode, run, stripAnsi } from "@test/support/live/process"

let host: IsolatedHost

describe("real TUI /transfer-session", () => {
  beforeAll(async () => {
    host = await startIsolatedHost("opencode-session-manager-transfer-")
  }, 180_000)

  afterAll(async () => {
    await host?.stop()
  }, 60_000)

  it("browses folders with the arrows and a typed path, then moves the open session to a folder it creates", async () => {
    const turn = await host.opencode(["run", "--model", `mock/${MODEL}`, "Hello."])
    expect(turn.exitCode).toBe(0)
    const sessionID = (await host.sessions())[0]!.id
    // The TUI resolves paths before showing them, so the test compares resolved ones (`/var`
    // vs `/private/var` on macOS).
    const workspace = realpathSync(host.workspace)
    const tree = path.resolve(workspace, "..", "tree")
    for (const name of ["alpha", "beta", "Gamma", ".hidden"]) await mkdir(path.join(tree, name), { recursive: true })
    const envFile = path.join(host.workspace, "..", "tui-env.json")
    await writeFile(envFile, JSON.stringify(host.environment))
    const node = Bun.which("node")
    if (!node) throw new Error("node executable not found")

    const driven = await run(
      [node, "tests/support/live/drive-transfer.mjs", requireOpenCode(), host.url, sessionID, envFile, workspace, tree, "fresh"],
      { timeoutMs: 180_000 },
    )
    const result = JSON.parse(driven.stdout.trim().split("\n").at(-1)!)
    expect({ steps: result.steps, screen: result.screen }).toEqual({
      steps: { sidebar: true, browser: true, listed: true, entered: true, confirm: true, toast: true },
      screen: undefined,
    })
    const rows = (lines: string[]) => lines.slice(2, -1)
    const footer = "↑↓ select   → open folder   ← parent folder   enter move here   esc cancel"
    // The dialog fits each row into 82 columns (its 88-column width in a wide terminal): a
    // temporary folder longer than that keeps its start and end around `…`. Every row below
    // goes through that format, so short paths read unchanged on every platform.
    const dialogWidth = 82
    const row = (kind: "folder" | "here" | "new", label: string, active: boolean) =>
      rowText({ kind, label, directory: label }, active, dialogWidth).trim()
    // The known folders: the workspace, once, with no second grey copy of the path.
    expect(result.checkpoints.opened.filter((line: string) => line.includes("workspace")).map((line: string) => line.replace(/^› /, ""))).toEqual([row("folder", workspace, true).replace(/^› /, "")])
    expect(result.checkpoints.opened.at(-1)).toBe(footer)
    // A typed folder: itself first, then its folders by name, ignoring case; hidden ones left out.
    expect(rows(result.checkpoints.tree)).toEqual([row("here", tree, true), row("folder", `${tree}/alpha`, false), row("folder", `${tree}/beta`, false), row("folder", `${tree}/Gamma`, false)])
    // Completing `al`: the completion is highlighted; → goes into it; ← twice is the tree's parent.
    expect(rows(result.checkpoints.completing)).toEqual([row("new", `${tree}/al`, false), row("folder", `${tree}/alpha`, true)])
    // The path box scrolls: it shows the last 67 columns of a longer path (its width in the
    // 160-column terminal), while a short path shows whole on every platform.
    const visibleTail = (p: string) => (p.length <= 67 ? p : p.slice(-67))
    expect(result.checkpoints.entered[1]).toBe(visibleTail(`${tree}/alpha/`))
    expect(rows(result.checkpoints.entered)).toEqual([row("here", `${tree}/alpha`, true)])
    // ← twice is the tree's parent: the box shows it (scrolled on macOS) and its rows still
    // name the tree — whole on Linux, fitted around `…` on macOS, both keeping the end.
    expect(result.checkpoints.up[1].endsWith(`${path.basename(path.dirname(tree))}/`)).toBe(true)
    expect(rows(result.checkpoints.up).some((line) => line.includes(tree.slice(-53)))).toBe(true)
    // A folder that does not exist: a second Enter creates it.
    expect(rows(result.checkpoints.typedNew)).toEqual([row("new", `${tree}/alpha/fresh`, true)])
    expect(result.checkpoints.confirm.at(-1)).toStartWith("Enter again to create ")
    const destination = path.join(tree, "alpha", "fresh")
    expect(existsSync(destination)).toBe(true)

    const listed = await run([requireOpenCode(), "api", "session.list", "--server", host.url], { env: host.environment, cwd: host.workspace })
    expect(listed.exitCode).toBe(0)
    const moved = (JSON.parse(listed.stdout) as { data: Array<{ id: string; location: { directory: string } }> }).data.find(
      (entry) => entry.id === sessionID,
    )
    expect(stripAnsi(moved!.location.directory)).toBe(destination)
  }, 300_000)
})
