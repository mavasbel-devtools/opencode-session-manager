import { DatabaseNotFoundError } from "@session-manager/domain/errors/DatabaseNotFoundError"
import { MagicContextTooNewError } from "@session-manager/domain/errors/MagicContextTooNewError"
import { MagicContextUnavailableError } from "@session-manager/domain/errors/MagicContextUnavailableError"
import { MagicContextUpgradeError } from "@session-manager/domain/errors/MagicContextUpgradeError"
import type { ContextCopyReport } from "@session-manager/domain/model/MagicContextRelease"
import type { ContextCopyInput, CopyMagicContextPort } from "@session-manager/domain/ports/inbound/CopyMagicContextPort"
import type { MagicContextReleasePort } from "@session-manager/domain/ports/outbound/MagicContextReleasePort"
import type { MagicContextStorePort } from "@session-manager/domain/ports/outbound/MagicContextStorePort"
import type { MaintenanceFileSystemPort } from "@session-manager/domain/ports/outbound/MaintenanceFileSystemPort"
import type { SqlitePort } from "@session-manager/domain/ports/outbound/SqlitePort"

/**
 * Two Magic Context stores can only exchange rows in one format. The copy is made with `VACUUM INTO`
 * from a read-only connection, then upgraded by the installed Magic Context's own migrations, the
 * same code that upgrades a live store when OpenCode starts. A store newer than the installed release
 * is refused: nothing can migrate it down.
 */
export class CopyMagicContextUseCase implements CopyMagicContextPort {
  private readonly sqlite: SqlitePort
  private readonly store: MagicContextStorePort
  private readonly release: MagicContextReleasePort
  private readonly fileSystem: MaintenanceFileSystemPort

  constructor(sqlite: SqlitePort, store: MagicContextStorePort, release: MagicContextReleasePort, fileSystem: MaintenanceFileSystemPort) {
    this.sqlite = sqlite
    this.store = store
    this.release = release
    this.fileSystem = fileSystem
  }

  copy(input: ContextCopyInput): ContextCopyReport {
    if (!this.fileSystem.exists(input.source)) throw new DatabaseNotFoundError(input.source)
    const release = this.release.installed()
    if (release === null) throw new MagicContextUnavailableError(this.release.searched())
    const from = this.store.formatVersion(input.source)
    if (from !== null && from > release.latestFormat)
      throw new MagicContextTooNewError(input.source, from, release.latestFormat, release.version)

    this.sqlite.vacuumInto(input.source, input.target)
    const upgraded = from === null || from < release.latestFormat
    if (upgraded) {
      const outcome = this.release.upgrade(release, input.target)
      if (!outcome.ok) throw new MagicContextUpgradeError(input.target, outcome.detail)
    }
    const to = this.store.formatVersion(input.target)
    if (to !== release.latestFormat)
      throw new MagicContextUpgradeError(input.target, `the copy reports format ${to}, expected ${release.latestFormat}`)
    return {
      source: input.source,
      target: input.target,
      from_format: from,
      to_format: to,
      upgraded,
      magic_context_version: release.version,
    }
  }
}
