import type { CatalogProfileUseCase } from "@session-manager/application/CatalogProfileUseCase"
import { ProfileUnreadableError } from "@session-manager/domain/errors/ProfileUnreadableError"
import type { OpenedProfile } from "@session-manager/domain/model/Browser"
import { joinPath } from "@session-manager/domain/model/DatabasePaths"
import { profileAt } from "@session-manager/domain/model/Profile"
import type { OpenProfilePort } from "@session-manager/domain/ports/inbound/OpenProfilePort"
import type { MaintenanceFileSystemPort } from "@session-manager/domain/ports/outbound/MaintenanceFileSystemPort"
import type { RuntimePort } from "@session-manager/domain/ports/outbound/RuntimePort"

const SIDECARS = ["", "-wal", "-shm"] as const

/**
 * Reads a profile in place, read-only. A store SQLite cannot open where it lies (an NTFS-compressed
 * Windows partition mounted on Linux reports `disk I/O error`) is copied, with its `-wal` and `-shm`,
 * into a private temporary folder and read there; `close` removes that folder.
 */
export class OpenProfileUseCase implements OpenProfilePort {
  private readonly catalog: CatalogProfileUseCase
  private readonly fileSystem: MaintenanceFileSystemPort
  private readonly runtime: RuntimePort

  constructor(catalog: CatalogProfileUseCase, fileSystem: MaintenanceFileSystemPort, runtime: RuntimePort) {
    this.catalog = catalog
    this.fileSystem = fileSystem
    this.runtime = runtime
  }

  open(name: string, dataHome: string): OpenedProfile {
    const profile = profileAt(name, dataHome)
    let unreadable: ProfileUnreadableError
    try {
      return { catalog: this.catalog.catalog(profile), snapshot: null }
    } catch (error) {
      if (!(error instanceof ProfileUnreadableError)) throw error
      unreadable = error
    }
    const snapshot = joinPath(this.runtime.temporaryDirectory(), "opencode", `session-manager-${this.runtime.stamp()}-${name}`)
    const copy = profileAt(name, snapshot)
    try {
      this.copyStore(profile.opencodeDb, copy.opencodeDb)
      this.copyStore(profile.contextDb, copy.contextDb)
      return { catalog: { ...this.catalog.catalog(copy), profile }, snapshot }
    } catch (error) {
      this.fileSystem.removeTree(snapshot)
      // Unreadable as a copy too: the store itself is damaged, so name the store, not the copy.
      throw error instanceof ProfileUnreadableError ? unreadable : error
    }
  }

  close(opened: OpenedProfile): void {
    if (opened.snapshot !== null) this.fileSystem.removeTree(opened.snapshot)
  }

  private copyStore(from: string, to: string): void {
    if (!this.fileSystem.exists(from)) return
    this.fileSystem.mkdirp(to.slice(0, to.lastIndexOf("/")))
    for (const suffix of SIDECARS) if (this.fileSystem.exists(from + suffix)) this.fileSystem.copyFile(from + suffix, to + suffix)
  }
}
