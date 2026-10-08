import { afterEach, beforeEach, test } from "bun:test"
import assert from "node:assert/strict"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { mkdirSync } from "node:fs"
import { join } from "node:path"
import { bootstrap } from "@session-manager/main/cli/cli"
import { buildContainer, type ContainerOverrides } from "@session-manager/main/cli-container"
import type { CliEnvironment } from "@session-manager/infrastructure/adapters/inbound/cli/CompactCliAdapter"
import { captureConsole, captureConsoleError } from "@test/support/maintenance/console"
import { fileSha, makeDatabase } from "@test/support/maintenance/database"
import { removeTemporary, temporaryWorkspace } from "@test/support/maintenance/temporary"
import { ownImage } from "@test/support/maintenance/platform"

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

async function runCli(
  argv: readonly string[],
  overrides: ContainerOverrides = {},
  env: CliEnvironment = environment(),
): Promise<{ code: number; lines: string[] }> {
  const capture = captureConsole()
  try {
    return { code: (await buildContainer(env, overrides)).run(argv), lines: capture.lines }
  } finally {
    capture.restore()
  }
}

function namesOf(target: string, filter: (name: string) => boolean): string[] {
  return readdirSync(target).filter(filter)
}

test("preflight reports the real database without writing it", async () => {
  const dbPath = join(directory, "opencode.db")
  makeDatabase(dbPath)
  const before = fileSha(dbPath)
  const { code, lines } = await runCli(["preflight", "--db", dbPath])
  assert.equal(code, 0)
  assert.equal(lines[0], `database: ${dbPath}`)
  const report = JSON.parse(lines[1] ?? "") as { files: Record<string, number | null>; pages: { freelist_count: number }; free_disk_bytes: number }
  assert.equal(report.files["opencode.db"], statSync(dbPath).size)
  assert.ok(report.pages.freelist_count > 0, "the delete left free pages to reclaim")
  assert.ok(report.free_disk_bytes > 0)
  assert.equal(fileSha(dbPath), before)
})

test("rehearse proves a compacted copy and deletes it unless --keep is given", async () => {
  const dbPath = join(directory, "opencode.db")
  makeDatabase(dbPath)
  const rehearsal = join(directory, "rehearsal")

  const dropped = await runCli(["rehearse", "--db", dbPath])
  assert.equal(dropped.code, 0)
  assert.ok(dropped.lines.includes("PASS integrity_ok"))
  assert.ok(dropped.lines.includes("PASS no_target_sidecars"))
  assert.ok(dropped.lines.some((line) => line.startsWith("REHEARSAL OK vacuum_ms=")))
  assert.deepEqual(namesOf(rehearsal, (name) => name.startsWith("opencode.db.compact-")), [])
  assert.equal(namesOf(rehearsal, (name) => name.endsWith(".json")).length, 1)

  const kept = await runCli(["rehearse", "--db", dbPath, "--keep"])
  assert.equal(kept.code, 0)
  const copies = namesOf(rehearsal, (name) => name.startsWith("opencode.db.compact-"))
  assert.equal(copies.length, 1)
  assert.ok(statSync(join(rehearsal, copies[0] ?? "")).size < statSync(dbPath).size)
})

test("run swaps a verified copy in, keeps the originals in the backup, and rollback restores them", async () => {
  const dbPath = join(directory, "opencode.db")
  makeDatabase(dbPath)
  const original = fileSha(dbPath)

  const { code, lines } = await runCli(["run", "--db", dbPath])
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

  const rolled = await runCli(["rollback", join(directory, backup), "--db", dbPath])
  assert.equal(rolled.code, 0)
  assert.ok(rolled.lines.some((line) => line.startsWith("ROLLED BACK restored=opencode.db")))
  assert.equal(fileSha(dbPath), original)
})

test("the default database path comes from XDG_DATA_HOME and the ambient runtime", async () => {
  const xdg = join(directory, "xdg")
  mkdirSync(join(xdg, "opencode"), { recursive: true })
  makeDatabase(join(xdg, "opencode", "opencode.db"))
  const { code, lines } = await runCli(["preflight"], {}, { OPENCODE_DB_COMPACT_IMAGE: NO_IMAGE, XDG_DATA_HOME: xdg })
  assert.equal(code, 0)
  assert.equal(lines[0], `database: ${xdg}/opencode/opencode.db`)
})

test("preflight reports the real running processes for the guarded image", async () => {
  const dbPath = join(directory, "opencode.db")
  makeDatabase(dbPath)
  const image = ownImage()
  const { code, lines } = await runCli(["preflight", "--db", dbPath], {}, { OPENCODE_DB_COMPACT_IMAGE: image })
  assert.equal(code, 0)
  const report = JSON.parse(lines[1] ?? "") as { running: Array<{ image: string; pid: number }> }
  assert.ok(report.running.some((entry) => entry.pid === process.pid), `${image} (this test process) is running`)
  for (const entry of report.running) assert.equal(entry.image.toLowerCase(), image.toLowerCase())
})

test("usage is printed for an unknown mode and a bare rollback", async () => {
  const unknown = await runCli(["bogus"])
  assert.equal(unknown.code, 2)
  assert.ok(unknown.lines.some((line) => line.startsWith("usage: opencode-session-manager")))
  assert.equal((await runCli(["rollback"])).code, 2)
  assert.equal((await runCli([])).code, 2)
})

test("bootstrap returns the exit code, and prints ERROR with exit 1 when a command fails", async () => {
  const logged = captureConsole()
  const errored = captureConsoleError()
  let usage: number
  let failure: number
  try {
    usage = await bootstrap(["bogus"], environment())
    failure = await bootstrap(["rollback", join(directory, "missing"), "--db", join(directory, "opencode.db")], environment())
  } finally {
    logged.restore()
    errored.restore()
  }
  assert.equal(usage, 2)
  assert.equal(failure, 1)
  assert.ok(logged.lines.some((line) => line.startsWith("usage: opencode-session-manager")))
  assert.ok(errored.lines.some((line) => line.startsWith("ERROR: no original database")))
})
