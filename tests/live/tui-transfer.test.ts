// LIVE tier: `/transfer-session` in the real OpenCode 2 TUI, in a real
// pseudo-terminal, attached to an isolated host (private XDG dirs, never the
// user's opencode.db) with the plugin installed as in production. The real
// keymap, slash command, select dialog, prompt dialog and `session.move` run
// here; the result is read back from the real server.
import { afterAll, beforeAll, describe, expect, it } from "bun:test"
import { existsSync } from "node:fs"
import { writeFile } from "node:fs/promises"
import path from "node:path"
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

  it("moves the open session to a new folder created on the way", async () => {
    const turn = await host.opencode(["run", "--model", `mock/${MODEL}`, "Hello."])
    expect(turn.exitCode).toBe(0)
    const sessionID = (await host.sessions())[0]!.id
    const destination = path.join(host.workspace, "..", "moved", "here")
    const envFile = path.join(host.workspace, "..", "tui-env.json")
    await writeFile(envFile, JSON.stringify(host.environment))
    const node = Bun.which("node")
    if (!node) throw new Error("node executable not found")

    const driven = await run(
      [node, "tests/support/live/drive-transfer.mjs", requireOpenCode(), host.url, sessionID, envFile, host.workspace, destination],
      { timeoutMs: 180_000 },
    )
    const result = JSON.parse(driven.stdout.trim().split("\n").at(-1)!)
    expect({ steps: result.steps, screen: result.screen }).toEqual({
      steps: { sidebar: true, picker: true, prompt: true, toast: true },
      screen: undefined,
    })
    expect(existsSync(destination)).toBe(true)

    const listed = await run([requireOpenCode(), "api", "session.list", "--server", host.url], { env: host.environment, cwd: host.workspace })
    expect(listed.exitCode).toBe(0)
    const moved = (JSON.parse(listed.stdout) as { data: Array<{ id: string; location: { directory: string } }> }).data.find(
      (entry) => entry.id === sessionID,
    )
    expect(stripAnsi(moved!.location.directory)).toBe(path.resolve(destination))
  }, 300_000)
})
