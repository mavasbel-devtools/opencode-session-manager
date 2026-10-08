import type { DatabaseSizesService } from "@session-manager/application/DatabaseSizesService"
import { dirName } from "@session-manager/domain/model/DatabasePaths"
import type { PreflightInput, PreflightPort, PreflightReport } from "@session-manager/domain/ports/inbound/PreflightPort"
import type { MaintenanceFileSystemPort } from "@session-manager/domain/ports/outbound/MaintenanceFileSystemPort"
import type { ProcessListPort } from "@session-manager/domain/ports/outbound/ProcessListPort"
import type { SqlitePort } from "@session-manager/domain/ports/outbound/SqlitePort"

/** Read-only: what exists, how big it is, how much free disk there is, and whether OpenCode is running. */
export class PreflightUseCase implements PreflightPort {
  private readonly sqlite: SqlitePort
  private readonly fileSystem: MaintenanceFileSystemPort
  private readonly processes: ProcessListPort
  private readonly sizes: DatabaseSizesService

  constructor(
    sqlite: SqlitePort,
    fileSystem: MaintenanceFileSystemPort,
    processes: ProcessListPort,
    sizes: DatabaseSizesService,
  ) {
    this.sqlite = sqlite
    this.fileSystem = fileSystem
    this.processes = processes
    this.sizes = sizes
  }

  execute(input: PreflightInput): PreflightReport {
    return {
      files: this.sizes.sizes(input.dbPath),
      pages: this.sqlite.pageStats(input.dbPath),
      free_disk_bytes: this.fileSystem.freeBytes(dirName(input.dbPath)),
      running: this.processes.list(input.image),
    }
  }
}
