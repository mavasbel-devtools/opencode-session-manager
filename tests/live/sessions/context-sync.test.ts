import { afterAll, beforeAll, describe, expect, it } from "bun:test"
import { Database } from "bun:sqlite"
import { existsSync, mkdirSync } from "node:fs"
import { homedir, tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { defaultDataHome, profileAt } from "@session-manager/domain/model/Profile"
import { InstalledMagicContextAdapter } from "@session-manager/infrastructure/adapters/outbound/magic-context/InstalledMagicContextAdapter"
import { removeTemporary, temporaryWorkspace } from "@test/support/maintenance/temporary"

/**
 * A real sync into a copy of this machine's profile (the live stores are only read, with
 * `VACUUM INTO`), from another machine's profile named by OPENCODE_SM_LIVE_OTHER_PROFILE (a data
 * home, for example a copy of a Windows machine's). The result must open in the installed Magic
 * Context, through its own schema fence and migration guard.
 */
const home = process.env["HOME"] ?? homedir()
const live = profileAt("live", defaultDataHome({ XDG_DATA_HOME: process.env["XDG_DATA_HOME"] }, home))
const other = process.env["OPENCODE_SM_LIVE_OTHER_PROFILE"]
const cli = fileURLToPath(new URL("../../../src/main/cli/cli.ts", import.meta.url))

let directory = ""
beforeAll(() => {
  directory = temporaryWorkspace("oc-context-sync-live-")
})
afterAll(() => {
  removeTemporary(directory)
})

const ready = other !== undefined && existsSync(live.opencodeDb) && existsSync(live.contextDb) && existsSync(profileAt("other", other).contextDb)

describe("context sync with the installed Magic Context", () => {
  it.skipIf(!ready)(
    "copies another profile's state into a copy of this machine's, which the installed Magic Context then opens",
    () => {
      const copy = profileAt("copy", join(directory, "copy"))
      for (const [from, to] of [
        [live.opencodeDb, copy.opencodeDb],
        [live.contextDb, copy.contextDb],
      ] as const) {
        mkdirSync(dirname(to), { recursive: true })
        const db = new Database(from, { readonly: true })
        try {
          db.query("vacuum into ?").run(to)
        } finally {
          db.close()
        }
      }
      const result = Bun.spawnSync([process.execPath, cli, "context", "sync", "--from", other!, "--to", copy.dataHome, "--all"], { env: process.env })
      expect(result.exitCode).toBe(0)
      const report = JSON.parse(result.stdout.toString())
      expect(report.checks).toEqual({ integrity_ok: true, foreign_keys_ok: true, anchors_ok: true, counts_ok: true })

      const release = new InstalledMagicContextAdapter([join(process.env["XDG_CACHE_HOME"] || join(home, ".cache"), "opencode")], undefined, process.execPath, tmpdir())
      const installed = release.installed()
      expect(installed).not.toBeNull()
      expect(release.upgrade(installed!, copy.contextDb)).toEqual({ ok: true, format: installed!.latestFormat })
    },
    600_000,
  )
})
