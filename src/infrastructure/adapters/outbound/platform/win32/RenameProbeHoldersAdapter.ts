import type { DatabaseHoldersPort } from "#domain/ports/outbound/DatabaseHoldersPort.ts"
import type { FileSystemPort } from "#domain/ports/outbound/FileSystemPort.ts"

/**
 * Windows: renames the file away and back. Windows refuses the rename (EBUSY) while any process holds
 * an open handle, so the refusal code is the answer. It cannot name the holder.
 */
export class RenameProbeHoldersAdapter implements DatabaseHoldersPort {
  private readonly fileSystem: FileSystemPort
  private readonly pid: number

  constructor(fileSystem: FileSystemPort, pid: number) {
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
