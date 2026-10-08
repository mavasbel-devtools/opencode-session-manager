import { test } from "bun:test"
import assert from "node:assert/strict"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { BuildAndVerifyService } from "@session-manager/application/BuildAndVerifyService"
import { DatabaseSizesService } from "@session-manager/application/DatabaseSizesService"
import { GuardService } from "@session-manager/application/GuardService"
import { PreflightUseCase } from "@session-manager/application/PreflightUseCase"
import { SwapService } from "@session-manager/application/SwapService"
import { FingerprintComparer } from "@session-manager/domain/services/FingerprintComparer"
import { ParityPolicy } from "@session-manager/domain/services/ParityPolicy"
import { NodeMaintenanceFileSystemAdapter } from "@session-manager/infrastructure/adapters/outbound/fs/NodeMaintenanceFileSystemAdapter"
import { BunSqliteAdapter } from "@session-manager/infrastructure/adapters/outbound/sqlite/BunSqliteAdapter"
import { platformAdapters } from "@session-manager/main/cli/platform"
import { fileSha, makeDatabase } from "@test/support/maintenance/database"
import { FakeRuntime } from "@test/support/maintenance/fakes/runtime"
import { removeTemporary, temporaryWorkspace } from "@test/support/maintenance/temporary"

const NO_IMAGE = "no-such-image-opencode-db-compact.exe"

test("component: the real adapters compact a real database and prove parity", async () => {
  const directory = temporaryWorkspace("oc-compact-component-")
  try {
    const source = join(directory, "opencode.db")
    makeDatabase(source)
    const before = fileSha(source)
    const fileSystem = new NodeMaintenanceFileSystemAdapter()
    const sqlite = new BunSqliteAdapter()
    const service = new BuildAndVerifyService(
      sqlite,
      fileSystem,
      new FakeRuntime(),
      new FingerprintComparer(),
      new ParityPolicy(),
    )

    const result = service.buildAndVerify({ source, target: join(directory, "compact.db"), strict: true })
    assert.equal(result.ok, true)
    assert.deepEqual(result.checks, {
      integrity_ok: true,
      foreign_keys_ok: true,
      freelist_zero: true,
      parity_ok: true,
      journal_wal: true,
      no_target_sidecars: true,
    })
    assert.ok(result.target_bytes < fileSystem.size(source))
    assert.equal(fileSha(source), before, "the source is byte-identical after the run")
    assert.equal(result.comparison.tables.every((table) => table.match), true)
  } finally {
    removeTemporary(directory)
  }
})

test("component: preflight and the guard work against a real database", async () => {
  const directory = temporaryWorkspace("oc-compact-component-")
  try {
    const dbPath = join(directory, "opencode.db")
    makeDatabase(dbPath)
    const fileSystem = new NodeMaintenanceFileSystemAdapter()
    const sqlite = new BunSqliteAdapter()
    const { processes, holders } = await platformAdapters(process.platform, fileSystem, process.pid)

    const report = new PreflightUseCase(sqlite, fileSystem, processes, new DatabaseSizesService(fileSystem)).execute({
      dbPath,
      image: NO_IMAGE,
    })
    assert.equal(report.files["opencode.db"], fileSystem.size(dbPath))
    assert.ok(report.pages.freelist_count > 0)
    assert.deepEqual(report.running, [])

    const guard = new GuardService(fileSystem, processes, holders)
    guard.checkEnvironment({ dbPath, image: NO_IMAGE })
    assert.ok(guard.checkSpace({ dbPath, requiredBytes: 0 }).free_bytes > 0)
    assert.equal(fileSystem.exists(dbPath), true)
  } finally {
    removeTemporary(directory)
  }
})

test("component: the swap service moves real files and restores them when a later move fails", async () => {
  const directory = temporaryWorkspace("oc-compact-component-")
  try {
    const fileSystem = new NodeMaintenanceFileSystemAdapter()
    const swapper = new SwapService(fileSystem)
    const dbPath = join(directory, "opencode.db")
    const compacted = join(directory, "compact.db")
    writeFileSync(dbPath, "database")
    writeFileSync(`${dbPath}-wal`, "wal")
    writeFileSync(compacted, "compacted")

    const backup = join(directory, "backup")
    mkdirSync(join(backup, "opencode.db-wal"), { recursive: true })
    writeFileSync(join(backup, "opencode.db-wal", "occupied"), "x")
    assert.throws(
      () => swapper.swap({ dbPath, compacted, backupDir: backup }),
      /swap failed and the original files were restored/,
    )
    assert.equal(readFileSync(dbPath, "utf8"), "database", "the database was restored")
  } finally {
    removeTemporary(directory)
  }
})
