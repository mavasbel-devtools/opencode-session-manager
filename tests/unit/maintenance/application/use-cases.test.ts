import { test } from "bun:test"
import assert from "node:assert/strict"
import { BuildAndVerifyService } from "@session-manager/application/BuildAndVerifyService"
import { CompactUseCase } from "@session-manager/application/CompactUseCase"
import { DatabaseSizesService } from "@session-manager/application/DatabaseSizesService"
import { GuardService } from "@session-manager/application/GuardService"
import { PreflightUseCase } from "@session-manager/application/PreflightUseCase"
import { RehearseUseCase } from "@session-manager/application/RehearseUseCase"
import { RollbackUseCase } from "@session-manager/application/RollbackUseCase"
import { SwapService } from "@session-manager/application/SwapService"
import type { Fingerprint } from "@session-manager/domain/model/Database"
import { FingerprintComparer } from "@session-manager/domain/services/FingerprintComparer"
import { ParityPolicy } from "@session-manager/domain/services/ParityPolicy"
import { RequiredSpacePolicy } from "@session-manager/domain/services/RequiredSpacePolicy"
import { FakeFileSystem } from "@test/support/maintenance/fakes/file-system"
import { FakeHolders } from "@test/support/maintenance/fakes/holders"
import { FakeOutput } from "@test/support/maintenance/fakes/output"
import { FakeProcessList } from "@test/support/maintenance/fakes/processes"
import { FakeReportSink } from "@test/support/maintenance/fakes/report-sink"
import { FakeRuntime } from "@test/support/maintenance/fakes/runtime"
import { FakeSqlite } from "@test/support/maintenance/fakes/sqlite"

const DB = "C:/x/opencode.db"
const STAMP = "2026-09-27-00-00-00"
const print: Fingerprint = { schema: [], header: { userVersion: 0, applicationId: 0 }, tables: { t: { rows: 1, sha256: "aa" } } }

interface World {
  readonly fileSystem: FakeFileSystem
  readonly sqlite: FakeSqlite
  readonly processes: FakeProcessList
  readonly holders: FakeHolders
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
  const holders = new FakeHolders()
  const guard = new GuardService(fileSystem, processes, holders)
  return {
    fileSystem,
    sqlite,
    processes,
    holders,
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
  w.holders.holder = "opencode 77"
  assert.throws(
    () => new RollbackUseCase(w.fileSystem, w.processes, w.guard, w.runtime).execute({ dbPath: DB, backupDir, image: "x" }),
    /held open by another process \(opencode 77\)/,
  )
})

test("the FakeOutput keeps the CLI lines, for the adapter test to reuse", () => {
  const output = new FakeOutput()
  output.line("a")
  output.line("b")
  assert.equal(output.text(), "a\nb")
})
