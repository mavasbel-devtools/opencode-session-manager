import { DatabaseHeldError } from "@session-manager/domain/errors/DatabaseHeldError"
import { DatabaseNotFoundError } from "@session-manager/domain/errors/DatabaseNotFoundError"
import { InsufficientSpaceError } from "@session-manager/domain/errors/InsufficientSpaceError"
import { ProcessRunningError } from "@session-manager/domain/errors/ProcessRunningError"
import { dirName } from "@session-manager/domain/model/DatabasePaths"
import type { DatabaseHoldersPort } from "@session-manager/domain/ports/outbound/DatabaseHoldersPort"
import type { MaintenanceFileSystemPort } from "@session-manager/domain/ports/outbound/MaintenanceFileSystemPort"
import type { ProcessListPort } from "@session-manager/domain/ports/outbound/ProcessListPort"

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
  private readonly fileSystem: MaintenanceFileSystemPort
  private readonly processes: ProcessListPort
  private readonly holders: DatabaseHoldersPort

  constructor(fileSystem: MaintenanceFileSystemPort, processes: ProcessListPort, holders: DatabaseHoldersPort) {
    this.fileSystem = fileSystem
    this.processes = processes
    this.holders = holders
  }

  /** Refuses while another process holds the database open; how that is detected is the platform's business. */
  assertNotHeld(dbPath: string): void {
    const holder = this.holders.heldBy(dbPath)
    if (holder !== null) throw new DatabaseHeldError(dbPath, holder)
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
