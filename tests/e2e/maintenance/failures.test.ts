import { afterEach, beforeEach, test } from "bun:test"
import assert from "node:assert/strict"
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { Database } from "bun:sqlite"
import { SUPPORTED_PLATFORMS } from "@session-manager/main/cli/platform"
import { buildContainer } from "@session-manager/main/cli-container"
import type { CliEnvironment } from "@session-manager/infrastructure/adapters/inbound/cli/CompactCliAdapter"
import { BunSqliteAdapter } from "@session-manager/infrastructure/adapters/outbound/sqlite/BunSqliteAdapter"
import { captureConsole } from "@test/support/maintenance/console"
import { fileSha, makeDatabase } from "@test/support/maintenance/database"
import { DemandingSpacePolicy, TamperingSqlite } from "@test/support/maintenance/faults"
import { FakeRuntime } from "@test/support/maintenance/fakes/runtime"
import { removeTemporary, temporaryWorkspace } from "@test/support/maintenance/temporary"
import { heldByThisProcess, ownImage } from "@test/support/maintenance/platform"

const NO_IMAGE = "no-such-image-opencode-db-compact.exe"
const STAMP = "2026-09-27-00-00-00"
let directory: string

beforeEach(() => {
  directory = temporaryWorkspace("oc-compact-e2e-fail-")
})
afterEach(() => {
  removeTemporary(directory)
})

function environment(): CliEnvironment {
  return { OPENCODE_DB_COMPACT_IMAGE: NO_IMAGE, OPENCODE_DB_COMPACT_REHEARSAL_DIR: join(directory, "rehearsal") }
}

async function attempt(
  argv: readonly string[],
  overrides: Parameters<typeof buildContainer>[1] = {},
): Promise<{ code: number; lines: string[] }> {
  const capture = captureConsole()
  try {
    return { code: (await buildContainer(environment(), overrides)).run(argv), lines: capture.lines }
  } finally {
    capture.restore()
  }
}

const runningProcesses = { list: () => [{ image: ownImage(), pid: process.pid }] }

test("run refuses a missing database before opening it", async () => {
  await assert.rejects(attempt(["run", "--db", join(directory, "absent.db")]), /database not found/)
})

test("run refuses while OpenCode is running and while the database is held open", async () => {
  const dbPath = join(directory, "opencode.db")
  makeDatabase(dbPath)
  await assert.rejects(attempt(["run", "--db", dbPath], { processes: runningProcesses }), /is running \(PIDs \d+\); close it and run "opencode service stop"/)

  const held = makeDatabase(join(directory, "held.db"), { keepOpen: true })
  try {
    await assert.rejects(attempt(["run", "--db", join(directory, "held.db")]), heldByThisProcess())
  } finally {
    held?.close()
  }
})

test("run refuses to start when the disk cannot hold the copy", async () => {
  const dbPath = join(directory, "opencode.db")
  makeDatabase(dbPath)
  await assert.rejects(attempt(["run", "--db", dbPath], { space: new DemandingSpacePolicy() }),
    /not enough free disk space: \d+ B free/,
  )
})

test("run aborts on a real parity break and leaves the originals untouched", async () => {
  const dbPath = join(directory, "opencode.db")
  makeDatabase(dbPath)
  const original = fileSha(dbPath)

  const { code, lines } = await attempt(["run", "--db", dbPath], {
    sqlite: new TamperingSqlite(new BunSqliteAdapter(), "delete from project where id = 'p1'"),
  })
  assert.equal(code, 1)
  assert.ok(lines.includes("FAIL parity_ok"))
  assert.ok(lines.some((line) => line.startsWith("  differs: ")))
  assert.ok(lines.some((line) => line.startsWith("ABORTED: originals untouched; failed copy kept at ")))
  assert.equal(fileSha(dbPath), original)
  assert.deepEqual(readdirSync(directory).filter((name) => name.startsWith("db-backup-")), [])
  assert.equal(readdirSync(directory).filter((name) => name.endsWith(".report.json")).length, 1)
})

test("run refuses to overwrite a target that already exists", async () => {
  const dbPath = join(directory, "opencode.db")
  makeDatabase(dbPath)
  writeFileSync(`${dbPath}.compact-${STAMP}`, "in the way")
  await assert.rejects(attempt(["run", "--db", dbPath], { runtime: new FakeRuntime() }), /refusing to overwrite existing/)
})

test("a rename that fails mid-swap restores the originals and reports it", async () => {
  const dbPath = join(directory, "opencode.db")
  makeDatabase(dbPath)
  const original = fileSha(dbPath)

  // A directory in the backup's way: Windows cannot replace it with the -wal file, so the swap
  // fails after the database itself was already moved — the restore path runs for real.
  const backup = join(directory, `db-backup-${STAMP}`)
  mkdirSync(join(backup, "opencode.db-wal"), { recursive: true })
  writeFileSync(join(backup, "opencode.db-wal", "occupied"), "x")

  await assert.rejects(attempt(["run", "--db", dbPath], { runtime: new FakeRuntime() }),
    /swap failed and the original files were restored/,
  )
  assert.equal(fileSha(dbPath), original, "the database was put back")
  assert.deepEqual(readdirSync(directory).filter((name) => name.includes(".compact-")), [`opencode.db.compact-${STAMP}`], "the failed copy is kept")
})

test("rollback refuses a missing backup, a running OpenCode, and a held database", async () => {
  const dbPath = join(directory, "opencode.db")
  makeDatabase(dbPath)
  await assert.rejects(attempt(["rollback", join(directory, "empty"), "--db", dbPath]), /no original database/)

  const backup = join(directory, "backup")
  mkdirSync(backup, { recursive: true })
  writeFileSync(join(backup, "opencode.db"), "original")
  await assert.rejects(attempt(["rollback", backup, "--db", dbPath], { processes: runningProcesses }),
    /is running \(PIDs \d+\); close it first/,
  )

  const held = new Database(dbPath)
  try {
    await assert.rejects(attempt(["rollback", backup, "--db", dbPath]), heldByThisProcess())
  } finally {
    held.close()
  }
})

test("rollback restores the original even when no database is currently in place", async () => {
  const dbPath = join(directory, "opencode.db")
  const backup = join(directory, "backup")
  mkdirSync(backup, { recursive: true })
  writeFileSync(join(backup, "opencode.db"), "original")

  const { code, lines } = await attempt(["rollback", backup, "--db", dbPath])
  assert.equal(code, 0)
  assert.ok(lines.some((line) => line.startsWith("ROLLED BACK restored=opencode.db")))
  assert.equal(readFileSync(dbPath, "utf8"), "original")
})

test("the composition root refuses an operating system it has no adapters for", async () => {
  const runtime = new FakeRuntime()
  runtime.platformName = "darwin"
  await assert.rejects(buildContainer(environment(), { runtime }), /^UnsupportedPlatformError: unsupported platform: darwin \(supported: linux, win32\)$/)
})

test("the composition root wires every supported operating system", async () => {
  for (const platform of SUPPORTED_PLATFORMS) {
    const runtime = new FakeRuntime()
    runtime.platformName = platform
    const capture = captureConsole()
    try {
      assert.equal((await buildContainer(environment(), { runtime })).run(["--help"]), 2, platform)
    } finally {
      capture.restore()
    }
  }
})
