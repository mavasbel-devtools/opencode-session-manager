import { SwapFailedError } from "#domain/errors/DomainErrors.ts"
import { baseName } from "#domain/model/Paths.ts"
import { SIDECARS } from "#domain/model/Sidecars.ts"
import type { FileSystemPort } from "#domain/ports/outbound/FileSystemPort.ts"
import { joinPath } from "#domain/model/Paths.ts"

export interface SwapInput {
  readonly dbPath: string
  readonly compacted: string
  readonly backupDir: string
}

/** Moves the database and its sidecars into the backup, then moves the compacted copy into place. */
export class SwapService {
  private readonly fileSystem: FileSystemPort

  constructor(fileSystem: FileSystemPort) {
    this.fileSystem = fileSystem
  }

  swap(input: SwapInput): readonly string[] {
    this.fileSystem.mkdirp(input.backupDir)
    const moved: string[] = []
    try {
      for (const suffix of SIDECARS) {
        if (!this.fileSystem.exists(input.dbPath + suffix)) continue
        this.fileSystem.rename(input.dbPath + suffix, joinPath(input.backupDir, baseName(input.dbPath) + suffix))
        moved.push(suffix)
      }
      this.fileSystem.rename(input.compacted, input.dbPath)
    } catch (error) {
      for (const suffix of moved) {
        this.fileSystem.rename(joinPath(input.backupDir, baseName(input.dbPath) + suffix), input.dbPath + suffix)
      }
      throw new SwapFailedError(error instanceof Error ? error.message : String(error))
    }
    return moved.map((suffix) => baseName(input.dbPath) + suffix)
  }
}
