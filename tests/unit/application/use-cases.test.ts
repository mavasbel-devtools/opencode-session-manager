import { test } from "node:test"
import assert from "node:assert/strict"
import { BuildAndVerifyService } from "#application/BuildAndVerifyService.ts"
import { CompactUseCase } from "#application/CompactUseCase.ts"
import { DatabaseSizesService } from "#application/DatabaseSizesService.ts"
import { GuardService } from "#application/GuardService.ts"
import { PreflightUseCase } from "#application/PreflightUseCase.ts"
import { RehearseUseCase } from "#application/RehearseUseCase.ts"
import { RollbackUseCase } from "#application/RollbackUseCase.ts"
import { SwapService } from "#application/SwapService.ts"
import type { Fingerprint } from "#domain/model/Database.ts"
import { FingerprintComparer } from "#domain/services/FingerprintComparer.ts"
import { ParityPolicy } from "#domain/services/ParityPolicy.ts"
import { RequiredSpacePolicy } from "#domain/services/RequiredSpacePolicy.ts"
import { FakeFileSystem } from "#test/support/fakes/file-system.ts"
import { FakeOutput } from "#test/support/fakes/output.ts"
import { FakeProcessList } from "#test/support/fakes/processes.ts"
import { FakeReportSink } from "#test/support/fakes/report-sink.ts"
import { FakeRuntime } from "#test/support/fakes/runtime.ts"
import { FakeSqlite } from "#test/support/fakes/sqlite.ts"

const DB = "C:/x/opencode.db"
const STAMP = "2026-09-27-00-00-00"
const print: Fingerprint = { schema: [], header: { userVersion: 0, applicationId: 0 }, tables: { t: { rows: 1, sha256: "aa" } } }

interface World {
  readonly fileSystem: FakeFileSystem
  readonly sqlite: FakeSqlite
  readonly processes: FakeProcessList
  readonly runtime: FakeRuntime
  readonly reports: FakeReportSink
  readonly sizes: DatabaseSizesService
  readonly guard: GuardService
  readonly swapper: SwapService
  readonly buildAndVerify: BuildAndVerifyService
}

function world(options: { readonly mismatched?: boolean } = {}): World {
  const fileSystem = new FakeFileSystem()
  fileSystem.add(DB, "database")
  const sqlite = new FakeSqlite({
    fingerprint: print,
    targetFingerprint:
      options.mismatched === true ? { ...print, tables: { t: { rows: 1, sha256: "bb" } } } : print,
    onVacuum: (_source, target) => fileSystem.add(target, "compact"),
  })
  const processes = new FakeProcessList()
  const runtime = new FakeRuntime()
  const reports = new FakeReportSink()
  const sizes = new DatabaseSizesService(fileSystem)
  const guard = new GuardService(fileSystem, processes, runtime)
  return {
    fileSystem,
    sqlite,
    processes,
    runtime,
    reports,
    sizes,
    guard,
    swapper: new SwapService(fileSystem),
    buildAndVerify: new BuildAndVerifyService(sqlite, fileSystem, runtime, new FingerprintComparer(), new ParityPolicy()),
  }
}

test("PreflightUseCase reports sizes, pages, free disk and running processes", () => {
  const w = world()
  w.processes.running = [{ image: "opencode.exe", pid: 3 }]
  const report = new PreflightUseCase(w.sqlite, w.fileSystem, w.processes, w.sizes).execute({ dbPath: DB, image: "opencode.exe" })
  assert.deepEqual(report.files, { "opencode.db": 8, "opencode.db-wal": null, "opencode.db-shm": null })
  assert.equal(report.pages.page_size, 4096)
  assert.equal(report.free_disk_bytes, 1_000_000)
  assert.deepEqual(report.running, [{ image: "opencode.exe", pid: 3 }])
})

test("RehearseUseCase builds, writes a report, and keeps the copy only with --keep", () => {
  const w = world()
  const useCase = new RehearseUseCase(w.buildAndVerify, w.sizes, w.sqlite, w.fileSystem, w.reports, w.runtime)
  const dropped = useCase.execute({ dbPath: DB, directory: "C:/x/rehearsal", keep: false })
  assert.equal(dropped.build.ok, true)
  assert.equal(dropped.reportPath, `C:/x/rehearsal/report-${STAMP}.json`)
  assert.equal(w.reports.written.length, 1)
  assert.equal(w.reports.written[0]?.path, `C:/x/rehearsal/report-${STAMP}.json`)
  assert.equal(w.fileSystem.exists(`C:/x/rehearsal/opencode.db.compact-${STAMP}`), false)

  const kept = useCase.execute({ dbPath: DB, directory: "C:/x/rehearsal", keep: true })
  assert.equal(kept.build.ok, true)
  assert.equal(w.fileSystem.exists(`C:/x/rehearsal/opencode.db.compact-${STAMP}`), true)
})

test("CompactUseCase swaps a verified copy in and keeps the originals in the backup", () => {
  const w = world()
  const outcome = new CompactUseCase(
    w.buildAndVerify,
    w.guard,
    w.swapper,
    w.sizes,
    new RequiredSpacePolicy(),
    w.sqlite,
    w.fileSystem,
    w.reports,
    w.runtime,
  ).execute({ dbPath: DB, image: "no-such.exe" })
  assert.equal(outcome.swapped, true)
  assert.equal(outcome.backupDir, `C:/x/db-backup-${STAMP}`)
  assert.equal(outcome.reportPath, `C:/x/db-backup-${STAMP}/report.json`)
  assert.equal(outcome.beforeBytes, 8)
  assert.equal(outcome.afterBytes, 7)
  assert.equal(outcome.postIntegrityOk, true)
  assert.equal(outcome.failedTarget, null)
  assert.equal(w.fileSystem.size(DB), 7, "the compacted copy is now in place")
  assert.equal(w.fileSystem.size(`C:/x/db-backup-${STAMP}/opencode.db`), 8, "the original is in the backup")
  const written = w.reports.written[0]?.report as { swapped: boolean; pre_guard: { free_bytes: number } }
  assert.equal(written.swapped, true)
  assert.equal(written.pre_guard.free_bytes, 1_000_000)
})

test("CompactUseCase aborts on a failed verification and leaves the originals alone", () => {
  const w = world({ mismatched: true })
  const outcome = new CompactUseCase(
    w.buildAndVerify,
    w.guard,
    w.swapper,
    w.sizes,
    new RequiredSpacePolicy(),
    w.sqlite,
    w.fileSystem,
    w.reports,
    w.runtime,
  ).execute({ dbPath: DB, image: "no-such.exe" })
  assert.equal(outcome.swapped, false)
  assert.equal(outcome.failedTarget, `${DB}.compact-${STAMP}`)
  assert.equal(outcome.reportPath, `${DB}.compact-${STAMP}.report.json`)
  assert.equal(outcome.backupDir, null)
  assert.equal(outcome.afterBytes, null)
  assert.equal(outcome.postIntegrityOk, false)
  assert.equal(outcome.build.checks.parity_ok, false)
  assert.equal((w.reports.written[0]?.report as { swapped: boolean }).swapped, false)
  assert.equal(w.fileSystem.size(DB), 8, "the original was never moved")
})

test("RollbackUseCase restores the originals and parks the current files", () => {
  const w = world()
  const backupDir = "C:/x/db-backup-1"
  w.fileSystem.add(`${backupDir}/opencode.db`, "original")
  w.fileSystem.add(`${backupDir}/opencode.db-wal`, "original-wal")
  w.fileSystem.add(DB, "compacted")
  w.fileSystem.add(`${DB}-shm`, "compacted-shm")

  const outcome = new RollbackUseCase(w.fileSystem, w.processes, w.guard, w.runtime).execute({
    dbPath: DB,
    backupDir,
    image: "no-such.exe",
  })
  assert.deepEqual(outcome.restored, ["opencode.db", "opencode.db-wal"])
  assert.equal(outcome.parked, `${backupDir}/rolled-back-${STAMP}`)
  assert.equal(w.fileSystem.size(DB), "original".length)
  assert.equal(w.fileSystem.exists(`${DB}-shm`), false)
  assert.equal(w.fileSystem.size(`${backupDir}/rolled-back-${STAMP}/opencode.db`), "compacted".length)
})

test("RollbackUseCase refuses a missing backup and a running image", () => {
  const w = world()
  const useCase = new RollbackUseCase(w.fileSystem, w.processes, w.guard, w.runtime)
  assert.throws(() => useCase.execute({ dbPath: DB, backupDir: "C:/x/empty", image: "x" }), /no original database/)

  w.fileSystem.add("C:/x/db-backup-1/opencode.db", "original")
  w.processes.running = [{ image: "opencode.exe", pid: 9 }]
  assert.throws(() => useCase.execute({ dbPath: DB, backupDir: "C:/x/db-backup-1", image: "opencode.exe" }), /PIDs 9/)
})

test("RollbackUseCase works when no current database exists and refuses a held one", () => {
  const w = world()
  const backupDir = "C:/x/db-backup-1"
  w.fileSystem.add(`${backupDir}/opencode.db`, "original")
  w.fileSystem.remove(DB)
  assert.deepEqual(
    new RollbackUseCase(w.fileSystem, w.processes, w.guard, w.runtime).execute({ dbPath: DB, backupDir, image: "x" }).restored,
    ["opencode.db"],
  )

  w.fileSystem.add(`${backupDir}/opencode.db`, "original")
  w.fileSystem.add(DB, "held")
  w.fileSystem.failRenameFrom = DB
  assert.throws(
    () => new RollbackUseCase(w.fileSystem, w.processes, w.guard, w.runtime).execute({ dbPath: DB, backupDir, image: "x" }),
    /EBUSY/,
  )
})

test("the FakeOutput keeps the CLI lines, for the adapter test to reuse", () => {
  const output = new FakeOutput()
  output.line("a")
  output.line("b")
  assert.equal(output.text(), "a\nb")
})
