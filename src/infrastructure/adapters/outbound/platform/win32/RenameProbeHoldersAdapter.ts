import type { DatabaseHoldersPort } from "@session-manager/domain/ports/outbound/DatabaseHoldersPort"
import type { MaintenanceFileSystemPort } from "@session-manager/domain/ports/outbound/MaintenanceFileSystemPort"

/**
 * Windows: renames the file away and back. Windows refuses the rename (EBUSY) while any process holds
 * an open handle, so the refusal code is the answer. It cannot name the holder.
 */
export class RenameProbeHoldersAdapter implements DatabaseHoldersPort {
  private readonly fileSystem: MaintenanceFileSystemPort
  private readonly pid: number

  constructor(fileSystem: MaintenanceFileSystemPort, pid: number) {
    this.fileSystem = fileSystem
    this.pid = pid
  }

  heldBy(dbPath: string): string | null {
    const probe = `${dbPath}.lockprobe-${this.pid}`
    try {
      this.fileSystem.rename(dbPath, probe)
    } catch (error) {
      return error instanceof Error && "code" in error ? String((error as { code: unknown }).code) : String(error)
    }
    this.fileSystem.rename(probe, dbPath)
    return null
  }
}
