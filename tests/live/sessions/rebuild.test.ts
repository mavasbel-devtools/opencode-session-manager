import { describe, expect, it } from "bun:test"
import { existsSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { defaultDataHome, profileAt } from "@session-manager/domain/model/Profile"

/**
 * A real `/ctx-recomp` through this machine's running OpenCode, on the session
 * OPENCODE_SM_LIVE_REBUILD_SESSION names (opt-in: it spends historian tokens and replaces that
 * session's summaries with rebuilt ones), followed in the real Magic Context store until it ends.
 * Then a session id OpenCode does not have is refused by the server, not by this program.
 */
const home = process.env["HOME"] ?? homedir()
const live = profileAt("live", defaultDataHome({ XDG_DATA_HOME: process.env["XDG_DATA_HOME"] }, home))
const session = process.env["OPENCODE_SM_LIVE_REBUILD_SESSION"]
const service = join(process.env["XDG_STATE_HOME"] || join(home, ".local", "state"), "opencode", "service.json")
const cli = fileURLToPath(new URL("../../../src/main/cli/cli.ts", import.meta.url))

function run(...args: string[]) {
  const result = Bun.spawnSync([process.execPath, cli, "context", ...args, "--json"], { env: process.env })
  return { code: result.exitCode, report: JSON.parse(result.stdout.toString()) as { ok: boolean; sessions: { session_id: string; status: string; detail: string | null; summaries_after: number; runs: number }[] } }
}

describe("rebuilding Magic Context through the running OpenCode", () => {
  it.skipIf(session === undefined || !existsSync(live.contextDb) || !existsSync(service))(
    "rebuilds a real session's summaries with /ctx-recomp and follows it to its end; the server refuses an unknown session",
    () => {
      const rebuilt = run("recomp", "--session", session!, "--timeout", "30")
      expect(rebuilt.report.sessions[0]).toMatchObject({ session_id: session, status: "finished" })
      expect(rebuilt.report.sessions[0]!.runs).toBeGreaterThan(0)
      expect(rebuilt.report.sessions[0]!.summaries_after).toBeGreaterThan(0)
      expect([rebuilt.code, rebuilt.report.ok]).toEqual([0, true])
      const unknown = run("wrapup", "--session", "ses_doesnotexist0000000000", "--no-wait")
      expect(unknown.code).toBe(1)
      expect(unknown.report.sessions[0]).toMatchObject({ status: "refused" })
      expect(unknown.report.sessions[0]!.detail).toStartWith("the server answered 404")
    },
    40 * 60_000,
  )
})
