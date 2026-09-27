import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { BuildAndVerifyService } from "#application/BuildAndVerifyService.ts"
import { DatabaseSizesService } from "#application/DatabaseSizesService.ts"
import { GuardService } from "#application/GuardService.ts"
import { PreflightUseCase } from "#application/PreflightUseCase.ts"
import { SwapService } from "#application/SwapService.ts"
import { FingerprintComparer } from "#domain/services/FingerprintComparer.ts"
import { ParityPolicy } from "#domain/services/ParityPolicy.ts"
import { NodeFileSystemAdapter } from "#infrastructure/adapters/outbound/NodeFileSystemAdapter.ts"
import { NodeSqliteAdapter } from "#infrastructure/adapters/outbound/NodeSqliteAdapter.ts"
import { TasklistAdapter } from "#infrastructure/adapters/outbound/TasklistAdapter.ts"
import { fileSha, makeDatabase } from "#test/support/database.ts"
import { FakeRuntime } from "#test/support/fakes/runtime.ts"
import { removeTemporary, temporaryWorkspace } from "#test/support/temporary.ts"

const NO_IMAGE = "no-such-image-opencode-db-compact.exe"

test("component: the real adapters compact a real database and prove parity", () => {
  const directory = temporaryWorkspace("oc-compact-component-")
  try {
    const source = join(directory, "opencode.db")
    makeDatabase(source)
    const before = fileSha(source)
    const fileSystem = new NodeFileSystemAdapter()
    const sqlite = new NodeSqliteAdapter()
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

test("component: preflight and the guard work against a real database", () => {
  const directory = temporaryWorkspace("oc-compact-component-")
  try {
    const dbPath = join(directory, "opencode.db")
    makeDatabase(dbPath)
    const fileSystem = new NodeFileSystemAdapter()
    const sqlite = new NodeSqliteAdapter()
    const processes = new TasklistAdapter()
    const runtime = new FakeRuntime()

    const report = new PreflightUseCase(sqlite, fileSystem, processes, new DatabaseSizesService(fileSystem)).execute({
      dbPath,
      image: NO_IMAGE,
    })
    assert.equal(report.files["opencode.db"], fileSystem.size(dbPath))
    assert.ok(report.pages.freelist_count > 0)
    assert.deepEqual(report.running, [])

    const guard = new GuardService(fileSystem, processes, runtime)
    guard.checkEnvironment({ dbPath, image: NO_IMAGE })
    assert.ok(guard.checkSpace({ dbPath, requiredBytes: 0 }).free_bytes > 0)
    assert.equal(fileSystem.exists(dbPath), true)
  } finally {
    removeTemporary(directory)
  }
})

test("component: the swap service moves real files and restores them when a later move fails", () => {
  const directory = temporaryWorkspace("oc-compact-component-")
  try {
    const fileSystem = new NodeFileSystemAdapter()
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
