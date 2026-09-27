import { DatabaseHeldError, DatabaseNotFoundError, InsufficientSpaceError, ProcessRunningError } from "#domain/errors/DomainErrors.ts"
import { dirName } from "#domain/model/Paths.ts"
import type { FileSystemPort } from "#domain/ports/outbound/FileSystemPort.ts"
import type { ProcessListPort } from "#domain/ports/outbound/ProcessListPort.ts"
import type { RuntimePort } from "#domain/ports/outbound/RuntimePort.ts"

export interface EnvironmentInput {
  readonly dbPath: string
  readonly image: string
}

export interface SpaceInput {
  readonly dbPath: string
  readonly requiredBytes: number
}

export interface FreeSpaceReport {
  readonly free_bytes: number
}

/**
 * The preconditions for touching the database. The environment check needs nothing but the path,
 * so it runs before the database is opened at all; the space check follows the page statistics.
 */
export class GuardService {
  private readonly fileSystem: FileSystemPort
  private readonly processes: ProcessListPort
  private readonly runtime: RuntimePort

  constructor(fileSystem: FileSystemPort, processes: ProcessListPort, runtime: RuntimePort) {
    this.fileSystem = fileSystem
    this.processes = processes
    this.runtime = runtime
  }

  /** Renames the file away and back. Windows refuses (EBUSY) while any SQLite connection holds it open. */
  assertNotHeld(dbPath: string): void {
    const probe = `${dbPath}.lockprobe-${this.runtime.pid()}`
    try {
      this.fileSystem.rename(dbPath, probe)
    } catch (error) {
      const code = error instanceof Error && "code" in error ? String((error as { code: unknown }).code) : String(error)
      throw new DatabaseHeldError(dbPath, code)
    }
    this.fileSystem.rename(probe, dbPath)
  }

  checkEnvironment(input: EnvironmentInput): void {
    const running = this.processes.list(input.image)
    if (running.length > 0) {
      throw new ProcessRunningError(
        input.image,
        running.map((entry) => entry.pid),
        'close it and run "opencode service stop"',
      )
    }
    if (!this.fileSystem.exists(input.dbPath)) throw new DatabaseNotFoundError(input.dbPath)
    this.assertNotHeld(input.dbPath)
  }

  checkSpace(input: SpaceInput): FreeSpaceReport {
    const free = this.fileSystem.freeBytes(dirName(input.dbPath))
    if (free < input.requiredBytes) throw new InsufficientSpaceError(free, input.requiredBytes)
    return { free_bytes: free }
  }
}
