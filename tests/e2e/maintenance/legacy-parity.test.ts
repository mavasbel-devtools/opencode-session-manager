import { afterEach, beforeEach, test } from "bun:test"
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { fileSha, makeDatabase } from "@test/support/maintenance/database"
import { legacyEnvironment } from "@test/support/maintenance/platform"
import { removeTemporary, temporaryWorkspace } from "@test/support/maintenance/temporary"

/**
 * The tool as it was before the restructure, kept verbatim under tests/support/fixtures/legacy.
 * Both implementations are run as real processes against identical databases — each in its own
 * directory, with the same file name — and their output is compared, so the restructure is proven
 * to preserve behaviour.
 */
const legacy = fileURLToPath(new URL("../../support/maintenance/fixtures/legacy/compact.mjs", import.meta.url))
const modern = fileURLToPath(new URL("../../../src/main/cli/cli.ts", import.meta.url))
const NO_IMAGE = "no-such-image-opencode-db-compact.exe"

let directory: string
beforeEach(() => {
  directory = temporaryWorkspace("oc-compact-parity-")
})
afterEach(() => {
  removeTemporary(directory)
})

/** A fresh directory holding one database called `opencode.db`, so both runs see the same names. */
function workspace(name: string): { directory: string; dbPath: string } {
  const own = join(directory, name)
  mkdirSync(own, { recursive: true })
  const dbPath = join(own, "opencode.db")
  makeDatabase(dbPath)
  return { directory: own, dbPath }
}

interface Outcome {
  readonly status: number | null
  readonly stdout: string
  readonly stderr: string
}

function run(script: string, args: readonly string[], rehearsal: string): Outcome {
  const result = spawnSync(process.execPath, [script, ...args], {
    encoding: "utf8",
    env: legacyEnvironment(directory, { ...process.env, OPENCODE_DB_COMPACT_IMAGE: NO_IMAGE, OPENCODE_DB_COMPACT_REHEARSAL_DIR: rehearsal }),
  })
  return { status: result.status, stdout: result.stdout, stderr: result.stderr }
}

const checkLines = (stdout: string): string[] =>
  stdout.split("\n").filter((line) => /^(PASS|FAIL) /.test(line) || line.startsWith("  differs: "))

const jsonOf = (stdout: string): Record<string, unknown> =>
  JSON.parse(stdout.slice(stdout.indexOf("{"))) as Record<string, unknown>

/** Free disk moves as the run creates its own files, so it is compared for sanity, not equality. */
function withoutFreeDisk(report: Record<string, unknown>): Record<string, unknown> {
  const copy = JSON.parse(JSON.stringify(report)) as Record<string, unknown>
  copy["free_disk_bytes"] = "measured separately"
  return copy
}

/** Drops what legitimately differs between two runs: the absolute path and the clock. */
function normaliseRunReport(report: Record<string, unknown>): Record<string, unknown> {
  const copy = JSON.parse(JSON.stringify(report)) as Record<string, unknown>
  delete copy["database"]
  const preGuard = copy["pre_guard"] as Record<string, unknown> | undefined
  if (preGuard) delete preGuard["free_bytes"]
  const result = copy["result"] as Record<string, unknown> | undefined
  if (result) {
    delete result["vacuum_ms"]
    delete result["total_ms"]
  }
  return copy
}

test("parity: preflight prints the same report as the tool it replaces", () => {
  const legacyWorld = workspace("legacy")
  const modernWorld = workspace("modern")
  const legacyRun = run(legacy, ["preflight", "--db", legacyWorld.dbPath], join(legacyWorld.directory, "r"))
  const modernRun = run(modern, ["preflight", "--db", modernWorld.dbPath], join(modernWorld.directory, "r"))

  assert.equal(legacyRun.status, 0, legacyRun.stderr)
  assert.equal(modernRun.status, 0, modernRun.stderr)
  assert.equal(modernRun.stdout.split("\n")[0], `database: ${modernWorld.dbPath}`)
  assert.deepEqual(withoutFreeDisk(jsonOf(modernRun.stdout)), withoutFreeDisk(jsonOf(legacyRun.stdout)))
  assert.ok((jsonOf(modernRun.stdout)["free_disk_bytes"] as number) > 0)
})

test("parity: rehearse prints exactly the same check lines", () => {
  const legacyWorld = workspace("legacy")
  const modernWorld = workspace("modern")
  const legacyRun = run(legacy, ["rehearse", "--db", legacyWorld.dbPath, "--keep"], join(legacyWorld.directory, "r"))
  const modernRun = run(modern, ["rehearse", "--db", modernWorld.dbPath, "--keep"], join(modernWorld.directory, "r"))

  assert.equal(legacyRun.status, 0, legacyRun.stderr)
  assert.equal(modernRun.status, 0, modernRun.stderr)
  assert.deepEqual(checkLines(modernRun.stdout), checkLines(legacyRun.stdout))
  assert.equal(checkLines(legacyRun.stdout).length, 6)
})

test("parity: run produces the same evidence, and rollback restores the original bytes", () => {
  const legacyWorld = workspace("legacy")
  const modernWorld = workspace("modern")
  const legacyOriginal = fileSha(legacyWorld.dbPath)
  const modernOriginal = fileSha(modernWorld.dbPath)

  const legacyRun = run(legacy, ["run", "--db", legacyWorld.dbPath], join(legacyWorld.directory, "r"))
  const modernRun = run(modern, ["run", "--db", modernWorld.dbPath], join(modernWorld.directory, "r"))
  assert.equal(legacyRun.status, 0, legacyRun.stderr)
  assert.equal(modernRun.status, 0, modernRun.stderr)
  assert.deepEqual(checkLines(modernRun.stdout), checkLines(legacyRun.stdout))
  assert.match(modernRun.stdout, /SWAPPED .*post_integrity_ok=true/)

  const legacyBackup = legacyRun.stdout.match(/backup=([^ \r\n]+)/)?.[1] ?? ""
  const modernBackup = modernRun.stdout.match(/backup=([^ \r\n]+)/)?.[1] ?? ""
  const legacyReport = JSON.parse(readFileSync(join(legacyBackup, "report.json"), "utf8")) as Record<string, unknown>
  const modernReport = JSON.parse(readFileSync(join(modernBackup, "report.json"), "utf8")) as Record<string, unknown>
  assert.deepEqual(normaliseRunReport(modernReport), normaliseRunReport(legacyReport))

  const legacyRollback = run(legacy, ["rollback", legacyBackup, "--db", legacyWorld.dbPath], join(legacyWorld.directory, "r"))
  const modernRollback = run(modern, ["rollback", modernBackup, "--db", modernWorld.dbPath], join(modernWorld.directory, "r"))
  assert.equal(legacyRollback.status, 0, legacyRollback.stderr)
  assert.equal(modernRollback.status, 0, modernRollback.stderr)
  assert.match(legacyRollback.stdout, /ROLLED BACK restored=opencode\.db/)
  assert.match(modernRollback.stdout, /ROLLED BACK restored=opencode\.db/)
  assert.equal(fileSha(legacyWorld.dbPath), legacyOriginal)
  assert.equal(fileSha(modernWorld.dbPath), modernOriginal)
})

test("parity: an unknown mode and a bare rollback both print usage and exit 2", () => {
  const world = workspace("modes")
  for (const script of [legacy, modern]) {
    assert.equal(run(script, ["bogus"], world.directory).status, 2)
    assert.equal(run(script, ["rollback"], world.directory).status, 2)
    assert.equal(run(script, ["preflight", "--db", world.dbPath], world.directory).status, 0)
  }
  assert.equal(statSync(world.dbPath).size > 0, true)
})
