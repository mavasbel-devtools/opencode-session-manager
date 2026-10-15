import { afterAll, beforeAll, describe, expect, it } from "bun:test"
import { Database } from "bun:sqlite"
import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { defaultDataHome, profileAt } from "@session-manager/domain/model/Profile"
import { query } from "@test/support/maintenance/repositories"
import { removeTemporary, temporaryWorkspace } from "@test/support/maintenance/temporary"
import { liveOtherProfile } from "@test/support/live/fixtures"

/**
 * A real whole-session sync into a copy of this machine's profile (the live stores are only read,
 * with `VACUUM INTO`), from another profile named by OPENCODE_SM_LIVE_OTHER_PROFILE (else the folder `bun run fixtures:live` fills) (a data home,
 * for example a copy of a Windows machine's). Then a sandboxed OpenCode (OPENCODE_BIN, default
 * `opencode` on PATH) must list, from the synced copy, every session the sync wrote under this
 * home, and a second sync must find nothing left to write.
 */
const home = process.env["HOME"] ?? homedir()
const live = profileAt("live", defaultDataHome({ XDG_DATA_HOME: process.env["XDG_DATA_HOME"] }, home))
const other = liveOtherProfile
const opencode = process.env["OPENCODE_BIN"] ?? "opencode"
const cli = fileURLToPath(new URL("../../../src/main/cli/cli.ts", import.meta.url))

let directory = ""
beforeAll(() => {
  directory = temporaryWorkspace("oc-session-sync-live-")
})
afterAll(() => {
  removeTemporary(directory)
})

const ready = other !== undefined && existsSync(live.opencodeDb) && existsSync(profileAt("other", other).opencodeDb)
const hasOpencode = spawnSync(opencode, ["--version"], { encoding: "utf8" }).status === 0

function sync(target: string, ...extra: string[]) {
  const result = Bun.spawnSync([process.execPath, cli, "sync", "--from", other!, "--to", target, "--all", ...extra], { env: process.env })
  expect(result.exitCode).toBe(0)
  return JSON.parse(result.stdout.toString()) as {
    checks: Record<string, unknown>
    sessions: { id: string; action: string; target_directory: string | null }[]
    backup_dir: string | null
  }
}

describe("sync with real profiles", () => {
  it.skipIf(!ready || !hasOpencode)(
    "syncs another profile into a copy of this machine's, a sandboxed OpenCode lists the synced sessions, and a second sync writes nothing",
    () => {
      const copy = profileAt("copy", join(directory, "copy"))
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

      const first = sync(copy.dataHome)
      expect(first.checks).toMatchObject({ integrity_ok: true, foreign_keys_ok: true, sessions_ok: true })
      const written = first.sessions.filter((session) => session.action === "copy" || session.action === "replace")

      const sandbox = join(directory, "sandbox")
      for (const folder of ["state", "cache", "config/opencode"]) mkdirSync(join(sandbox, folder), { recursive: true })
      const listed = spawnSync(opencode, ["session", "list", "--standalone", "--format", "json", "-n", "100000"], {
        cwd: home,
        encoding: "utf8",
        timeout: 180_000,
        maxBuffer: 64 * 1024 * 1024,
        env: { ...process.env, XDG_DATA_HOME: copy.dataHome, XDG_STATE_HOME: join(sandbox, "state"), XDG_CACHE_HOME: join(sandbox, "cache"), XDG_CONFIG_HOME: join(sandbox, "config") },
      })
      expect(listed.status).toBe(0)
      const ids = new Set((JSON.parse(listed.stdout) as { id: string }[]).map((session) => session.id))
      const active = new Set(query<{ id: string }>(copy.opencodeDb, "select id from session_v2 where time_archived is null").map((row) => row.id))
      const underHome = written.filter((session) => session.target_directory === home && active.has(session.id))
      expect(underHome.filter((session) => !ids.has(session.id))).toEqual([])

      const second = sync(copy.dataHome, "--dry-run")
      expect(second.sessions.filter((session) => session.action === "copy" || session.action === "replace")).toEqual([])
    },
    900_000,
  )
})
