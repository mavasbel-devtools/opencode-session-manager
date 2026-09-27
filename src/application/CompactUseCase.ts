import type { BuildAndVerifyService } from "#application/BuildAndVerifyService.ts"
import type { DatabaseSizesService } from "#application/DatabaseSizesService.ts"
import type { GuardService } from "#application/GuardService.ts"
import type { SwapService } from "#application/SwapService.ts"
import type { RequiredSpacePolicy } from "#domain/services/RequiredSpacePolicy.ts"
import { baseName, dirName, joinPath } from "#domain/model/Paths.ts"
import type { CompactInput, CompactOutcome, CompactPort } from "#domain/ports/inbound/CompactPort.ts"
import type { FileSystemPort } from "#domain/ports/outbound/FileSystemPort.ts"
import type { ReportSinkPort } from "#domain/ports/outbound/ReportSinkPort.ts"
import type { RuntimePort } from "#domain/ports/outbound/RuntimePort.ts"
import type { SqlitePort } from "#domain/ports/outbound/SqlitePort.ts"

/** The offline run: guard, build and verify, swap in only if every check passed, keep the originals. */
export class CompactUseCase implements CompactPort {
  private readonly buildAndVerify: BuildAndVerifyService
  private readonly guard: GuardService
  private readonly swapper: SwapService
  private readonly sizes: DatabaseSizesService
  private readonly space: RequiredSpacePolicy
  private readonly sqlite: SqlitePort
  private readonly fileSystem: FileSystemPort
  private readonly reports: ReportSinkPort
  private readonly runtime: RuntimePort

  constructor(
    buildAndVerify: BuildAndVerifyService,
    guard: GuardService,
    swapper: SwapService,
    sizes: DatabaseSizesService,
    space: RequiredSpacePolicy,
    sqlite: SqlitePort,
    fileSystem: FileSystemPort,
    reports: ReportSinkPort,
    runtime: RuntimePort,
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
  }

  execute(input: CompactInput): CompactOutcome {
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
