import type { BuildAndVerifyService } from "#application/BuildAndVerifyService.ts"
import type { DatabaseSizesService } from "#application/DatabaseSizesService.ts"
import { joinPath } from "#domain/model/Paths.ts"
import type { RehearseInput, RehearseOutcome, RehearsePort } from "#domain/ports/inbound/RehearsePort.ts"
import type { FileSystemPort } from "#domain/ports/outbound/FileSystemPort.ts"
import type { ReportSinkPort } from "#domain/ports/outbound/ReportSinkPort.ts"
import type { RuntimePort } from "#domain/ports/outbound/RuntimePort.ts"
import type { SqlitePort } from "#domain/ports/outbound/SqlitePort.ts"

/** Builds and checks a compacted copy without touching the live database, then keeps or deletes the copy. */
export class RehearseUseCase implements RehearsePort {
  private readonly buildAndVerify: BuildAndVerifyService
  private readonly sizes: DatabaseSizesService
  private readonly sqlite: SqlitePort
  private readonly fileSystem: FileSystemPort
  private readonly reports: ReportSinkPort
  private readonly runtime: RuntimePort

  constructor(
    buildAndVerify: BuildAndVerifyService,
    sizes: DatabaseSizesService,
    sqlite: SqlitePort,
    fileSystem: FileSystemPort,
    reports: ReportSinkPort,
    runtime: RuntimePort,
  ) {
    this.buildAndVerify = buildAndVerify
    this.sizes = sizes
    this.sqlite = sqlite
    this.fileSystem = fileSystem
    this.reports = reports
    this.runtime = runtime
  }

  execute(input: RehearseInput): RehearseOutcome {
    this.fileSystem.mkdirp(input.directory)
    const when = this.runtime.stamp()
    const target = joinPath(input.directory, `opencode.db.compact-${when}`)
    const before = { files: this.sizes.sizes(input.dbPath), pages: this.sqlite.pageStats(input.dbPath) }
    const build = this.buildAndVerify.buildAndVerify({ source: input.dbPath, target, strict: false })
    const reportPath = joinPath(input.directory, `report-${when}.json`)
    this.reports.write(reportPath, { mode: "rehearse", database: input.dbPath, before, result: build })
    if (!input.keep) this.fileSystem.remove(target)
    return { build, reportPath }
  }
}
