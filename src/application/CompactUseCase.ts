import type { BuildAndVerifyService } from "@session-manager/application/BuildAndVerifyService"
import type { DatabaseSizesService } from "@session-manager/application/DatabaseSizesService"
import type { GuardService } from "@session-manager/application/GuardService"
import type { StoreLockService } from "@session-manager/application/StoreLockService"
import type { SwapService } from "@session-manager/application/SwapService"
import type { RequiredSpacePolicy } from "@session-manager/domain/services/RequiredSpacePolicy"
import { baseName, dirName, joinPath } from "@session-manager/domain/model/DatabasePaths"
import type { CompactInput, CompactOutcome, CompactPort } from "@session-manager/domain/ports/inbound/CompactPort"
import type { MaintenanceFileSystemPort } from "@session-manager/domain/ports/outbound/MaintenanceFileSystemPort"
import type { ReportSinkPort } from "@session-manager/domain/ports/outbound/ReportSinkPort"
import type { RuntimePort } from "@session-manager/domain/ports/outbound/RuntimePort"
import type { SqlitePort } from "@session-manager/domain/ports/outbound/SqlitePort"

/** The offline run: guard, build and verify, swap in only if every check passed, keep the originals. */
export class CompactUseCase implements CompactPort {
  private readonly buildAndVerify: BuildAndVerifyService
  private readonly guard: GuardService
  private readonly swapper: SwapService
  private readonly sizes: DatabaseSizesService
  private readonly space: RequiredSpacePolicy
  private readonly sqlite: SqlitePort
  private readonly fileSystem: MaintenanceFileSystemPort
  private readonly reports: ReportSinkPort
  private readonly runtime: RuntimePort
  private readonly locks: StoreLockService

  constructor(
    buildAndVerify: BuildAndVerifyService,
    guard: GuardService,
    swapper: SwapService,
    sizes: DatabaseSizesService,
    space: RequiredSpacePolicy,
    sqlite: SqlitePort,
    fileSystem: MaintenanceFileSystemPort,
    reports: ReportSinkPort,
    runtime: RuntimePort,
    locks: StoreLockService,
  ) {
    this.buildAndVerify = buildAndVerify
    this.guard = guard
    this.swapper = swapper
    this.sizes = sizes
    this.space = space
    this.sqlite = sqlite
    this.fileSystem = fileSystem
    this.reports = reports
    this.runtime = runtime
    this.locks = locks
  }

  /** The whole run holds the database's lock, so no other opencode-session-manager writes it meanwhile. */
  execute(input: CompactInput): CompactOutcome {
    this.guard.checkEnvironment({ dbPath: input.dbPath, image: input.image })
    return this.locks.hold([input.dbPath], "run", (cleared) => ({ ...this.run(input), staleLocksCleared: cleared }))
  }

  private run(input: CompactInput): Omit<CompactOutcome, "staleLocksCleared"> {
    const when = this.runtime.stamp()
    this.guard.checkEnvironment({ dbPath: input.dbPath, image: input.image })
    const pages = this.sqlite.pageStats(input.dbPath)
    const files = this.sizes.sizes(input.dbPath)
    const requiredBytes = this.space.requiredBytes(pages, files[`${baseName(input.dbPath)}-wal`] ?? 0)
    const preGuard = this.guard.checkSpace({ dbPath: input.dbPath, requiredBytes })
    const target = `${input.dbPath}.compact-${when}`
    const build = this.buildAndVerify.buildAndVerify({ source: input.dbPath, target, strict: true })

    if (!build.ok) {
      const reportPath = `${target}.report.json`
      this.reports.write(reportPath, { mode: "run", database: input.dbPath, before: { files, pages }, result: build, swapped: false })
      return {
        swapped: false,
        build,
        reportPath,
        failedTarget: target,
        backupDir: null,
        beforeBytes: files[baseName(input.dbPath)] ?? null,
        afterBytes: null,
        postIntegrityOk: false,
      }
    }

    this.guard.checkEnvironment({ dbPath: input.dbPath, image: input.image })
    const backupDir = joinPath(dirName(input.dbPath), `db-backup-${when}`)
    const moved = this.swapper.swap({ dbPath: input.dbPath, compacted: target, backupDir })
    const after = { integrity: this.sqlite.integrity(input.dbPath), files: this.sizes.sizes(input.dbPath) }
    const reportPath = joinPath(backupDir, "report.json")
    this.reports.write(reportPath, {
      mode: "run",
      database: input.dbPath,
      before: { files, pages },
      pre_guard: preGuard,
      result: build,
      moved,
      after,
      swapped: true,
    })
    return {
      swapped: true,
      build,
      reportPath,
      failedTarget: null,
      backupDir,
      beforeBytes: files[baseName(input.dbPath)] ?? null,
      afterBytes: after.files[baseName(input.dbPath)] ?? null,
      postIntegrityOk: after.integrity.integrity_ok,
    }
  }
}
