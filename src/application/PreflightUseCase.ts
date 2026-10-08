import type { DatabaseSizesService } from "#application/DatabaseSizesService.ts"
import { dirName } from "#domain/model/Paths.ts"
import type { PreflightInput, PreflightPort, PreflightReport } from "#domain/ports/inbound/PreflightPort.ts"
import type { FileSystemPort } from "#domain/ports/outbound/FileSystemPort.ts"
import type { ProcessListPort } from "#domain/ports/outbound/ProcessListPort.ts"
import type { SqlitePort } from "#domain/ports/outbound/SqlitePort.ts"

/** Read-only: what exists, how big it is, how much free disk there is, and whether OpenCode is running. */
export class PreflightUseCase implements PreflightPort {
  private readonly sqlite: SqlitePort
  private readonly fileSystem: FileSystemPort
  private readonly processes: ProcessListPort
  private readonly sizes: DatabaseSizesService

  constructor(
    sqlite: SqlitePort,
    fileSystem: FileSystemPort,
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
