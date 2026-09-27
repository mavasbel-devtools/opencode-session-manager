// E2E tier: the real OpenCode 2.0.14 TUI, in a real Windows ConPTY (200x50),
// attached to an isolated host that never touches the user's opencode.db, with
// the plugin deployed through the production shims. This is where the real
// claim normalisation of packages/tui/src/plugin/api.tsx and the real <Slot>
// of render.tsx run — neither can be loaded in-process (88- and 165-file
// import graphs), so the ID's position under the title is proven here.
//
// Coverage is deliberately not measured in this tier: the code under test runs
// in another process, which no coverage tool of Bun or Node can see.
import { afterAll, beforeAll, describe, expect, it } from "bun:test"
import { writeFile } from "node:fs/promises"
import path from "node:path"
import { MODEL, startIsolatedHost, type IsolatedHost } from "@test/support/live/isolated-host"
import { requireOpenCode, run } from "@test/support/live/process"

let host: IsolatedHost

describe("real TUI sidebar", () => {
  beforeAll(async () => {
    host = await startIsolatedHost("opencode-session-id-tui-")
  }, 180_000)

  afterAll(async () => {
    await host?.stop()
  }, 60_000)

  it("shows the session ID as the first sidebar row under the title", async () => {
    const turn = await host.opencode(["run", "--model", `mock/${MODEL}`, "Call the session-id tool."])
    expect({ exitCode: turn.exitCode, output: turn.output }).toMatchObject({ exitCode: 0 })
    const sessions = await host.sessions()
    expect(sessions).toHaveLength(1)
    const sessionID = sessions[0]!.id
    const envFile = path.join(host.workspace, "..", "tui-env.json")
    await writeFile(envFile, JSON.stringify(host.environment))
    const node = Bun.which("node")
    if (!node) throw new Error("node executable not found")
    const driven = await run(
      [node, "tests/support/live/drive-tui.mjs", requireOpenCode(), host.url, sessionID, envFile, host.workspace],
      { timeoutMs: 120_000 },
    )
    const result = JSON.parse(driven.stdout.trim().split("\n").at(-1)!)
    // Evidence line for the verification record (sidebar rows as the real TUI drew them).
    console.log(
      `tui-evidence ${JSON.stringify({ sessionID, row: result.row, col: result.col, title: result.above2, blank: result.above1, line: result.line })}`,
    )
    expect({ found: result.found, screen: result.screen }).toEqual({ found: true, screen: undefined })
    expect(result.inSidebar).toBe(true)
    expect(result.line).toBe(sessionID)
    expect(result.sidebarOccurrences).toBe(1)
    // sidebar.tsx: title box (paddingBottom 1) -> one blank row -> first sidebar.content row.
    expect(result.above1).toBe("")
    expect(result.above2.length).toBeGreaterThan(0)
  }, 240_000)
})
