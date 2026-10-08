import { test } from "bun:test"
import assert from "node:assert/strict"
import { BuildAndVerifyService } from "@session-manager/application/BuildAndVerifyService"
import { DatabaseSizesService } from "@session-manager/application/DatabaseSizesService"
import { GuardService } from "@session-manager/application/GuardService"
import { SwapService } from "@session-manager/application/SwapService"
import type { Fingerprint } from "@session-manager/domain/model/Database"
import { FingerprintComparer } from "@session-manager/domain/services/FingerprintComparer"
import { ParityPolicy } from "@session-manager/domain/services/ParityPolicy"
import { FakeFileSystem } from "@test/support/maintenance/fakes/file-system"
import { FakeHolders } from "@test/support/maintenance/fakes/holders"
import { FakeProcessList } from "@test/support/maintenance/fakes/processes"
import { FakeRuntime } from "@test/support/maintenance/fakes/runtime"
import { FakeSqlite } from "@test/support/maintenance/fakes/sqlite"

const print = (sha: string): Fingerprint => ({ schema: [], header: { userVersion: 0, applicationId: 0 }, tables: { t: { rows: 1, sha256: sha } } })

test("DatabaseSizesService measures what exists and reports null for what does not", () => {
  const fileSystem = new FakeFileSystem()
  fileSystem.add("C:/x/opencode.db", "1234567890")
  assert.deepEqual(new DatabaseSizesService(fileSystem).sizes("C:/x/opencode.db"), {
    "opencode.db": 10,
    "opencode.db-wal": null,
    "opencode.db-shm": null,
  })
})

test("GuardService.assertNotHeld asks the platform and refuses with what it reports", () => {
  const holders = new FakeHolders()
  const guard = new GuardService(new FakeFileSystem(), new FakeProcessList(), holders)
  guard.assertNotHeld("C:/x/opencode.db")
  assert.deepEqual(holders.asked, ["C:/x/opencode.db"])

  holders.holder = "opencode 12, opencode 13"
  assert.throws(
    () => guard.assertNotHeld("C:/x/opencode.db"),
    /^DatabaseHeldError: C:\/x\/opencode\.db is held open by another process \(opencode 12, opencode 13\); close every OpenCode process first$/,
  )
})

test("GuardService.checkEnvironment refuses a running image, a missing file and a held file", () => {
  const processes = new FakeProcessList()
  const fileSystem = new FakeFileSystem()
  const holders = new FakeHolders()
  const guard = new GuardService(fileSystem, processes, holders)

  processes.running = [{ image: "opencode.exe", pid: 5 }, { image: "opencode.exe", pid: 6 }]
  assert.throws(
    () => guard.checkEnvironment({ dbPath: "C:/x/opencode.db", image: "opencode.exe" }),
    /opencode\.exe is running \(PIDs 5, 6\)/,
  )

  processes.running = []
  assert.throws(() => guard.checkEnvironment({ dbPath: "C:/x/opencode.db", image: "x" }), /database not found/)

  fileSystem.add("C:/x/opencode.db", "db")
  holders.holder = "EBUSY"
  assert.throws(() => guard.checkEnvironment({ dbPath: "C:/x/opencode.db", image: "x" }), /EBUSY/)

  holders.holder = null
  guard.checkEnvironment({ dbPath: "C:/x/opencode.db", image: "x" })
})

test("GuardService.checkSpace refuses a full disk", () => {
  const fileSystem = new FakeFileSystem()
  fileSystem.add("C:/x/opencode.db", "db")
  const guard = new GuardService(fileSystem, new FakeProcessList(), new FakeHolders())
  fileSystem.free = 1000
  assert.throws(() => guard.checkSpace({ dbPath: "C:/x/opencode.db", requiredBytes: 1001 }), /1000 B free, 1001 B required/)
  assert.deepEqual(guard.checkSpace({ dbPath: "C:/x/opencode.db", requiredBytes: 1000 }), { free_bytes: 1000 })
})

test("SwapService moves every sidecar into the backup and restores them when a later move fails", () => {
  const fileSystem = new FakeFileSystem()
  fileSystem.add("C:/x/opencode.db", "db")
  fileSystem.add("C:/x/opencode.db-wal", "wal")
  fileSystem.add("C:/x/opencode.db-shm", "shm")
  fileSystem.add("C:/x/compact.db", "new")
  const swapper = new SwapService(fileSystem)

  const moved = swapper.swap({ dbPath: "C:/x/opencode.db", compacted: "C:/x/compact.db", backupDir: "C:/x/db-backup-1" })
  assert.deepEqual(moved, ["opencode.db", "opencode.db-wal", "opencode.db-shm"])
  assert.equal(fileSystem.size("C:/x/opencode.db"), 3)
  assert.equal(fileSystem.exists("C:/x/opencode.db-wal"), false)
  assert.equal(fileSystem.size("C:/x/db-backup-1/opencode.db-wal"), 3)

  const failing = new FakeFileSystem()
  failing.add("C:/y/opencode.db", "db")
  failing.add("C:/y/opencode.db-wal", "wal")
  failing.add("C:/y/compact.db", "new")
  failing.failRenameFrom = "C:/y/opencode.db-wal"
  assert.throws(
    () => new SwapService(failing).swap({ dbPath: "C:/y/opencode.db", compacted: "C:/y/compact.db", backupDir: "C:/y/db-backup-1" }),
    /swap failed and the original files were restored: EBUSY/,
  )
  assert.equal(failing.size("C:/y/opencode.db"), 2, "the already-moved database was restored")
})

test("BuildAndVerifyService proves a copy and honours the strict/loose policy", () => {
  const fileSystem = new FakeFileSystem()
  fileSystem.add("C:/x/compact.db", "12345")
  const sqlite = new FakeSqlite({ fingerprint: print("aa"), targetFingerprint: print("aa") })
  const service = new BuildAndVerifyService(sqlite, fileSystem, new FakeRuntime(), new FingerprintComparer(), new ParityPolicy())

  const result = service.buildAndVerify({ source: "C:/x/opencode.db", target: "C:/x/compact.db", strict: true })
  assert.equal(result.ok, true)
  assert.deepEqual(result.checks, {
    integrity_ok: true,
    foreign_keys_ok: true,
    freelist_zero: true,
    parity_ok: true,
    journal_wal: true,
    no_target_sidecars: true,
  })
  assert.equal(result.target_bytes, 5)
  assert.equal(result.vacuum_ms, 1)
  assert.equal(result.total_ms, 2)

  const mismatched = new FakeSqlite({ fingerprint: print("aa"), targetFingerprint: print("bb") })
  const makeService = (): BuildAndVerifyService =>
    new BuildAndVerifyService(mismatched, fileSystem, new FakeRuntime(), new FingerprintComparer(), new ParityPolicy())

  const strict = makeService().buildAndVerify({ source: "C:/x/opencode.db", target: "C:/x/compact.db", strict: true })
  assert.equal(strict.ok, false)
  assert.equal(strict.checks.parity_ok, false)
  assert.deepEqual(strict.comparison.failures, ["table t differs"])

  const looseResult = makeService().buildAndVerify({ source: "C:/x/opencode.db", target: "C:/x/compact.db", strict: false })
  assert.equal(looseResult.ok, true)
  assert.equal(looseResult.checks.parity_ok, false)
})
