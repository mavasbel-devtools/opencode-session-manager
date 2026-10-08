import type { SidecarSizes } from "#domain/model/Database.ts"
import { sidecarPaths } from "#domain/model/Sidecars.ts"
import type { FileSystemPort } from "#domain/ports/outbound/FileSystemPort.ts"

/** Measured size of the database and each of its sidecars; `null` for one that does not exist. */
export class DatabaseSizesService {
  private readonly fileSystem: FileSystemPort

  constructor(fileSystem: FileSystemPort) {
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
