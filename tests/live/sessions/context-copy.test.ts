import { afterAll, beforeAll, describe, expect, it } from "bun:test"
import { existsSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { defaultDataHome, profileAt } from "@session-manager/domain/model/Profile"
import { fileSha } from "@test/support/maintenance/database"
import { removeTemporary, temporaryWorkspace } from "@test/support/maintenance/temporary"

/**
 * The installed Magic Context, run for real on copies. This machine's store is copied as is (it is
 * already in the installed format); an older store named by OPENCODE_SM_LIVE_OLD_CONTEXT (for
 * example a copy of a Windows machine's context.db) is upgraded by the release's own migrations.
 */
const home = process.env["HOME"] ?? homedir()
const live = profileAt("live", defaultDataHome({ XDG_DATA_HOME: process.env["XDG_DATA_HOME"] }, home)).contextDb
const older = process.env["OPENCODE_SM_LIVE_OLD_CONTEXT"]
const cli = fileURLToPath(new URL("../../../src/main/cli/cli.ts", import.meta.url))

let directory = ""
beforeAll(() => {
  directory = temporaryWorkspace("oc-context-live-")
})
afterAll(() => {
  removeTemporary(directory)
})

function copy(source: string, target: string) {
  const result = Bun.spawnSync([process.execPath, cli, "context", "copy", "--from", source, "--to", target], { env: process.env })
  return { code: result.exitCode, report: result.exitCode === 0 ? JSON.parse(result.stdout.toString()) : result.stderr.toString() }
}

describe("context copy with the installed Magic Context", () => {
  it.skipIf(!existsSync(live))("copies this machine's store in the installed format", () => {
    const { code, report } = copy(live, join(directory, "live-copy.db"))
    expect(code).toBe(0)
    expect(report.to_format).toBeGreaterThan(0)
    expect(report.upgraded).toBe(report.from_format !== report.to_format)
  })

  it.skipIf(older === undefined || !existsSync(older))("upgrades an older store's copy and leaves the store untouched", () => {
    const before = fileSha(older!)
    const { code, report } = copy(older!, join(directory, "older-copy.db"))
    expect(code).toBe(0)
    expect(report.upgraded).toBe(true)
    expect(report.to_format).toBeGreaterThan(report.from_format)
    expect(fileSha(older!)).toBe(before)
  })
})
