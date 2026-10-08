import { afterEach, beforeEach, test } from "node:test"
import assert from "node:assert/strict"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { mkdirSync } from "node:fs"
import { join } from "node:path"
import { bootstrap } from "#main/cli.ts"
import { buildContainer, type ContainerOverrides } from "#main/container.ts"
import type { CliEnvironment } from "#infrastructure/adapters/inbound/cli/CompactCliAdapter.ts"
import { captureConsole, captureConsoleError } from "#test/support/console.ts"
import { fileSha, makeDatabase } from "#test/support/database.ts"
import { removeTemporary, temporaryWorkspace } from "#test/support/temporary.ts"
import { ownImage } from "#test/support/platform.ts"

const NO_IMAGE = "no-such-image-opencode-db-compact.exe"
let directory: string

beforeEach(() => {
  directory = temporaryWorkspace("oc-compact-e2e-")
})
afterEach(() => {
  removeTemporary(directory)
})

function environment(extra: Record<string, string> = {}): CliEnvironment {
  return {
    OPENCODE_DB_COMPACT_IMAGE: NO_IMAGE,
    OPENCODE_DB_COMPACT_REHEARSAL_DIR: join(directory, "rehearsal"),
    ...extra,
  }
}

function runCli(
  argv: readonly string[],
  overrides: ContainerOverrides = {},
  env: CliEnvironment = environment(),
): { code: number; lines: string[] } {
  const capture = captureConsole()
  try {
    return { code: buildContainer(env, overrides).run(argv), lines: capture.lines }
  } finally {
    capture.restore()
  }
}

function namesOf(target: string, filter: (name: string) => boolean): string[] {
  return readdirSync(target).filter(filter)
}

test("preflight reports the real database without writing it", () => {
  const dbPath = join(directory, "opencode.db")
  makeDatabase(dbPath)
  const before = fileSha(dbPath)
  const { code, lines } = runCli(["preflight", "--db", dbPath])
  assert.equal(code, 0)
  assert.equal(lines[0], `database: ${dbPath}`)
  const report = JSON.parse(lines[1] ?? "") as { files: Record<string, number | null>; pages: { freelist_count: number }; free_disk_bytes: number }
  assert.equal(report.files["opencode.db"], statSync(dbPath).size)
  assert.ok(report.pages.freelist_count > 0, "the delete left free pages to reclaim")
  assert.ok(report.free_disk_bytes > 0)
  assert.equal(fileSha(dbPath), before)
})

test("rehearse proves a compacted copy and deletes it unless --keep is given", () => {
  const dbPath = join(directory, "opencode.db")
  makeDatabase(dbPath)
  const rehearsal = join(directory, "rehearsal")

  const dropped = runCli(["rehearse", "--db", dbPath])
  assert.equal(dropped.code, 0)
  assert.ok(dropped.lines.includes("PASS integrity_ok"))
  assert.ok(dropped.lines.includes("PASS no_target_sidecars"))
  assert.ok(dropped.lines.some((line) => line.startsWith("REHEARSAL OK vacuum_ms=")))
  assert.deepEqual(namesOf(rehearsal, (name) => name.startsWith("opencode.db.compact-")), [])
  assert.equal(namesOf(rehearsal, (name) => name.endsWith(".json")).length, 1)

  const kept = runCli(["rehearse", "--db", dbPath, "--keep"])
  assert.equal(kept.code, 0)
  const copies = namesOf(rehearsal, (name) => name.startsWith("opencode.db.compact-"))
  assert.equal(copies.length, 1)
  assert.ok(statSync(join(rehearsal, copies[0] ?? "")).size < statSync(dbPath).size)
})

test("run swaps a verified copy in, keeps the originals in the backup, and rollback restores them", () => {
  const dbPath = join(directory, "opencode.db")
  makeDatabase(dbPath)
  const original = fileSha(dbPath)

  const { code, lines } = runCli(["run", "--db", dbPath])
  assert.equal(code, 0)
  assert.equal(lines[0], `database: ${dbPath}`)
  assert.ok(lines.some((line) => line.startsWith("SWAPPED backup=")))

  const backup = namesOf(directory, (name) => name.startsWith("db-backup-"))[0] ?? ""
  assert.notEqual(backup, "")
  assert.equal(fileSha(join(directory, backup, "opencode.db")), original)
  assert.ok(statSync(dbPath).size < statSync(join(directory, backup, "opencode.db")).size, "the copy is smaller")
  const report = JSON.parse(readFileSync(join(directory, backup, "report.json"), "utf8")) as { swapped: boolean; after: { integrity: { integrity_ok: boolean } } }
  assert.equal(report.swapped, true)
  assert.equal(report.after.integrity.integrity_ok, true)
  assert.deepEqual(namesOf(directory, (name) => name.includes(".compact-")), [])

  const rolled = runCli(["rollback", join(directory, backup), "--db", dbPath])
  assert.equal(rolled.code, 0)
  assert.ok(rolled.lines.some((line) => line.startsWith("ROLLED BACK restored=opencode.db")))
  assert.equal(fileSha(dbPath), original)
})

test("the default database path comes from XDG_DATA_HOME and the ambient runtime", () => {
  const xdg = join(directory, "xdg")
  mkdirSync(join(xdg, "opencode"), { recursive: true })
  makeDatabase(join(xdg, "opencode", "opencode.db"))
  const { code, lines } = runCli(["preflight"], {}, { OPENCODE_DB_COMPACT_IMAGE: NO_IMAGE, XDG_DATA_HOME: xdg })
  assert.equal(code, 0)
  assert.equal(lines[0], `database: ${xdg}/opencode/opencode.db`)
})

test("preflight reports the real running processes for the guarded image", () => {
  const dbPath = join(directory, "opencode.db")
  makeDatabase(dbPath)
  const image = ownImage()
  const { code, lines } = runCli(["preflight", "--db", dbPath], {}, { OPENCODE_DB_COMPACT_IMAGE: image })
  assert.equal(code, 0)
  const report = JSON.parse(lines[1] ?? "") as { running: Array<{ image: string; pid: number }> }
  assert.ok(report.running.some((entry) => entry.pid === process.pid), `${image} (this test process) is running`)
  for (const entry of report.running) assert.equal(entry.image.toLowerCase(), image.toLowerCase())
})

test("usage is printed for an unknown mode and a bare rollback", () => {
  const unknown = runCli(["bogus"])
  assert.equal(unknown.code, 2)
  assert.ok(unknown.lines.some((line) => line.startsWith("usage: node src/main/cli.ts")))
  assert.equal(runCli(["rollback"]).code, 2)
  assert.equal(runCli([]).code, 2)
})

test("bootstrap returns the exit code, and prints ERROR with exit 1 when a command fails", () => {
  const logged = captureConsole()
  const errored = captureConsoleError()
  let usage: number
  let failure: number
  try {
    usage = bootstrap(["bogus"], environment())
    failure = bootstrap(["rollback", join(directory, "missing"), "--db", join(directory, "opencode.db")], environment())
  } finally {
    logged.restore()
    errored.restore()
  }
  assert.equal(usage, 2)
  assert.equal(failure, 1)
  assert.ok(logged.lines.some((line) => line.startsWith("usage: node src/main/cli.ts")))
  assert.ok(errored.lines.some((line) => line.startsWith("ERROR: no original database")))
})
