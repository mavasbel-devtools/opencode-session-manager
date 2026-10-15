import { afterAll, beforeAll, describe, expect, it } from "bun:test"
import { Database } from "bun:sqlite"
import { existsSync, mkdirSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { defaultDataHome, profileAt } from "@session-manager/domain/model/Profile"
import { removeTemporary, temporaryWorkspace } from "@test/support/maintenance/temporary"
import { liveOtherProfile } from "@test/support/live/fixtures"

/**
 * `verify` on this machine's profile (read-only), and a whole-session `sync` from another profile
 * (OPENCODE_SM_LIVE_OTHER_PROFILE) into a copy of this machine's, which `verify` must then pass and
 * a real OpenCode, sandboxed in its own XDG folders, must list. The live stores are only read.
 */
const home = process.env["HOME"] ?? homedir()
const live = profileAt("live", defaultDataHome({ XDG_DATA_HOME: process.env["XDG_DATA_HOME"] }, home))
const other = liveOtherProfile
const cli = fileURLToPath(new URL("../../../src/main/cli/cli.ts", import.meta.url))
const opencode = join(home, ".opencode", "bin", "opencode")

let directory = ""
beforeAll(() => {
  directory = temporaryWorkspace("oc-sync-verify-live-")
})
afterAll(() => {
  removeTemporary(directory)
})

const run = (argv: string[]) => {
  const result = Bun.spawnSync([process.execPath, cli, ...argv], { env: process.env })
  return { code: result.exitCode, json: JSON.parse(result.stdout.toString()) }
}
const storeFindings = (report: { findings: { kind: string }[] }) => report.findings.filter((entry) => entry.kind.startsWith("store-"))

describe("verify and sync on this machine", () => {
  it.skipIf(!existsSync(live.opencodeDb))(
    "verify reads this machine's profile and finds both stores sound",
    () => {
      const report = run(["verify", "--json"]).json
      expect(report.checks.opencode).toEqual({ integrity_ok: true, foreign_keys_ok: true })
      if (existsSync(live.contextDb)) expect(report.checks.context).toEqual({ integrity_ok: true, foreign_keys_ok: true })
      expect([report.sessions_checked > 0, storeFindings(report)]).toEqual([true, []])
    },
    600_000,
  )

  it.skipIf(other === undefined || !existsSync(live.opencodeDb) || !existsSync(opencode))(
    "a sync from the other profile into a copy of this one passes verify, and the copy opens in a sandboxed OpenCode",
    () => {
      const copy = profileAt("copy", join(directory, "data"))
      for (const [from, to] of [
        [live.opencodeDb, copy.opencodeDb],
        [live.contextDb, copy.contextDb],
      ] as const) {
        if (!existsSync(from)) continue
        mkdirSync(dirname(to), { recursive: true })
        const db = new Database(from, { readonly: true })
        try {
          db.query("vacuum into ?").run(to)
        } finally {
          db.close()
        }
      }
      const synced = run(["sync", "--from", other!, "--to", copy.dataHome, "--all"])
      expect(synced.code).toBe(0)
      expect(synced.json.checks).toMatchObject({ integrity_ok: true, foreign_keys_ok: true, sessions_ok: true })
      const verified = run(["verify", "--data", copy.dataHome, "--json"]).json
      expect(storeFindings(verified)).toEqual([])

      // The newest session of the copy whose folder exists here, listed by a real OpenCode on the copy.
      const newest = (verified.sessions as { id: string; directory: string }[]).find((session) => existsSync(session.directory))
      expect(newest).toBeDefined()
      const sandbox = (name: string) => join(directory, name)
      const listed = Bun.spawnSync([opencode, "session", "list", "--standalone", "--format", "json", "-n", "1000"], {
        cwd: newest!.directory,
        env: { ...process.env, XDG_DATA_HOME: copy.dataHome, XDG_STATE_HOME: sandbox("state"), XDG_CACHE_HOME: sandbox("cache"), XDG_CONFIG_HOME: sandbox("config") },
        timeout: 240_000,
      })
      expect(listed.exitCode).toBe(0)
      const ids = (JSON.parse(listed.stdout.toString()) as { id: string }[]).map((session) => session.id)
      expect(ids.length).toBeGreaterThan(0)
    },
    1_800_000,
  )
})
