import type { SidecarSizes } from "@session-manager/domain/model/Database"
import { sidecarPaths } from "@session-manager/domain/model/Sidecars"
import type { MaintenanceFileSystemPort } from "@session-manager/domain/ports/outbound/MaintenanceFileSystemPort"

/** Measured size of the database and each of its sidecars; `null` for one that does not exist. */
export class DatabaseSizesService {
  private readonly fileSystem: MaintenanceFileSystemPort

  constructor(fileSystem: MaintenanceFileSystemPort) {
    this.fileSystem = fileSystem
  }

  sizes(dbPath: string): SidecarSizes {
    const sizes: Record<string, number | null> = {}
    for (const { label, path } of sidecarPaths(dbPath)) {
      sizes[label] = this.fileSystem.exists(path) ? this.fileSystem.size(path) : null
    }
    return sizes
  }
}
