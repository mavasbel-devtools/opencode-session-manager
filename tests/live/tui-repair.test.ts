// LIVE tier: the plugin's startup location repair in the real OpenCode 2 TUI, attached to an
// isolated host (private XDG folders, never the user's stores) with the plugin installed as in
// production. A real session is created inside a real Git linked work tree; the whole workspace
// (repository and work tree) is then moved on disk and mapped in session-manager.jsonc. Opening
// the TUI must move the session through the host's own session.move and repair Git's links in
// both directions; a second TUI start must change nothing.
import { afterAll, beforeAll, describe, expect, it } from "bun:test"
import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, renameSync, writeFileSync } from "node:fs"
import path from "node:path"
import { MODEL, startIsolatedHost, type IsolatedHost } from "@test/support/live/isolated-host"
import { requireOpenCode, run, stripAnsi } from "@test/support/live/process"

let host: IsolatedHost

function git(cwd: string, ...args: string[]): string {
  const result = spawnSync("git", ["-C", cwd, ...args], {
    encoding: "utf8",
    env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" },
  })
  if (result.status !== 0) throw new Error(`git ${args.join(" ")}: ${result.stderr}`)
  return result.stdout.trim()
}

async function sessionDirectories(): Promise<Record<string, string>> {
  const listed = await run([requireOpenCode(), "api", "session.list", "--server", host.url], { env: host.environment, cwd: host.workspace })
  expect(listed.exitCode).toBe(0)
  const data = (JSON.parse(listed.stdout) as { data: Array<{ id: string; location: { directory: string } }> }).data
  return Object.fromEntries(data.map((entry) => [entry.id, stripAnsi(entry.location.directory)]))
}

async function openTui(expected: string): Promise<{ found: boolean; screen?: string[] }> {
  const envFile = path.join(host.workspace, "..", "tui-env.json")
  writeFileSync(envFile, JSON.stringify(host.environment))
  const node = Bun.which("node")
  if (!node) throw new Error("node executable not found")
  const driven = await run([node, "tests/support/live/drive-repair.mjs", requireOpenCode(), host.url, envFile, host.workspace, expected], { timeoutMs: 180_000 })
  return JSON.parse(driven.stdout.trim().split("\n").at(-1)!)
}

describe("real TUI startup location repair", () => {
  beforeAll(async () => {
    host = await startIsolatedHost("opencode-session-manager-repair-")
  }, 180_000)

  afterAll(async () => {
    await host?.stop()
  }, 60_000)

  it("moves a session out of a moved Git work tree, repairs Git's links, and is idempotent", async () => {
    const base = path.resolve(host.workspace, "..")
    const oldRoot = path.join(base, "old-workspace")
    const newRoot = path.join(base, "new-workspace")
    const repo = path.join(oldRoot, "repo")
    mkdirSync(repo, { recursive: true })
    git(repo, "init", "-q", "-b", "main")
    writeFileSync(path.join(repo, "README.md"), "x")
    git(repo, "add", ".")
    git(repo, "commit", "-q", "-m", "init")
    git(repo, "worktree", "add", "-q", "-b", "feature", path.join(oldRoot, "wt"))

    const turn = await run([requireOpenCode(), "run", "--model", `mock/${MODEL}`, "Hello.", "--server", host.url], {
      env: { ...host.environment, PWD: path.join(oldRoot, "wt") },
      cwd: path.join(oldRoot, "wt"),
      timeoutMs: 120_000,
    })
    expect(turn.exitCode).toBe(0)
    const before = await sessionDirectories()
    const [sessionID] = Object.entries(before).find(([, directory]) => directory === path.join(oldRoot, "wt")) ?? []
    expect(sessionID).toBeDefined()

    renameSync(oldRoot, newRoot)
    expect(git(path.join(newRoot, "repo"), "worktree", "list", "--porcelain")).toContain("prunable")
    writeFileSync(
      path.join(host.environment.XDG_CONFIG_HOME!, "opencode", "session-manager.jsonc"),
      `// approved relocation\n${JSON.stringify({ location_repair: { maps: [{ from: oldRoot, to: newRoot }] } })}`,
    )

    const opened = await openTui("Repaired 1 session location.")
    expect({ found: opened.found, screen: opened.screen }).toEqual({ found: true, screen: undefined })
    const after = await sessionDirectories()
    expect(after[sessionID!]).toBe(path.join(newRoot, "wt"))
    const list = git(path.join(newRoot, "repo"), "worktree", "list", "--porcelain")
    expect(list).toContain(`worktree ${path.join(newRoot, "wt")}\n`)
    expect(list).not.toContain("prunable")
    expect(git(path.join(newRoot, "wt"), "rev-parse", "--show-toplevel")).toBe(path.join(newRoot, "wt"))
    expect(existsSync(path.join(host.environment.XDG_DATA_HOME!, "opencode", "opencode.db.session-manager.lock"))).toBe(false)
    expect(existsSync(oldRoot)).toBe(false)

    // A second start finds nothing stale: no toast, no move.
    const again = await openTui("Repaired 1 session location.")
    expect(again.found).toBe(false)
    expect(await sessionDirectories()).toEqual(after)
  }, 400_000)
})
