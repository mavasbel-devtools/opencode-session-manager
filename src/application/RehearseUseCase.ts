import type { BuildAndVerifyService } from "@session-manager/application/BuildAndVerifyService"
import type { DatabaseSizesService } from "@session-manager/application/DatabaseSizesService"
import { joinPath } from "@session-manager/domain/model/DatabasePaths"
import type { RehearseInput, RehearseOutcome, RehearsePort } from "@session-manager/domain/ports/inbound/RehearsePort"
import type { MaintenanceFileSystemPort } from "@session-manager/domain/ports/outbound/MaintenanceFileSystemPort"
import type { ReportSinkPort } from "@session-manager/domain/ports/outbound/ReportSinkPort"
import type { RuntimePort } from "@session-manager/domain/ports/outbound/RuntimePort"
import type { SqlitePort } from "@session-manager/domain/ports/outbound/SqlitePort"

/** Builds and checks a compacted copy without touching the live database, then keeps or deletes the copy. */
export class RehearseUseCase implements RehearsePort {
  private readonly buildAndVerify: BuildAndVerifyService
  private readonly sizes: DatabaseSizesService
  private readonly sqlite: SqlitePort
  private readonly fileSystem: MaintenanceFileSystemPort
  private readonly reports: ReportSinkPort
  private readonly runtime: RuntimePort

  constructor(
    buildAndVerify: BuildAndVerifyService,
    sizes: DatabaseSizesService,
    sqlite: SqlitePort,
    fileSystem: MaintenanceFileSystemPort,
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
