import { DatabaseNotFoundError } from "@session-manager/domain/errors/DatabaseNotFoundError"
import { ProfileUnreadableError } from "@session-manager/domain/errors/ProfileUnreadableError"
import type { Profile } from "@session-manager/domain/model/Profile"
import { NO_MAGIC_CONTEXT, type MagicContextSummary, type ProfileCatalog, type StoredSession } from "@session-manager/domain/model/SessionCatalog"
import type { CatalogProfilePort } from "@session-manager/domain/ports/inbound/CatalogProfilePort"
import type { MagicContextStorePort } from "@session-manager/domain/ports/outbound/MagicContextStorePort"
import type { MaintenanceFileSystemPort } from "@session-manager/domain/ports/outbound/MaintenanceFileSystemPort"
import type { SessionStorePort } from "@session-manager/domain/ports/outbound/SessionStorePort"

/** Reads a profile's two stores and joins them per session. Never writes either store. */
export class CatalogProfileUseCase implements CatalogProfilePort {
  private readonly sessionStore: SessionStorePort
  private readonly magicContextStore: MagicContextStorePort
  private readonly fileSystem: MaintenanceFileSystemPort

  constructor(sessionStore: SessionStorePort, magicContextStore: MagicContextStorePort, fileSystem: MaintenanceFileSystemPort) {
    this.sessionStore = sessionStore
    this.magicContextStore = magicContextStore
    this.fileSystem = fileSystem
  }

  catalog(profile: Profile): ProfileCatalog {
    if (!this.fileSystem.exists(profile.opencodeDb)) throw new DatabaseNotFoundError(profile.opencodeDb)
    const sessions = this.read(profile.opencodeDb, () => this.sessionStore.sessions(profile.opencodeDb))
    const context: MagicContextSummary = this.fileSystem.exists(profile.contextDb)
      ? this.read(profile.contextDb, () => this.magicContextStore.summary(profile.contextDb))
      : NO_MAGIC_CONTEXT
    return {
      profile,
      sessions: [...sessions]
        .sort(newestFirst)
        .map((session) => ({ ...session, magicContext: context.sessions[session.id] ?? null })),
      magicContext: { available: context.available, schemaVersion: context.schemaVersion },
    }
  }

  private read<T>(path: string, work: () => T): T {
    try {
      return work()
    } catch (error) {
      throw new ProfileUnreadableError(path, error instanceof Error ? error.message : String(error))
    }
  }
}

function newestFirst(a: StoredSession, b: StoredSession): number {
  return b.timeUpdated - a.timeUpdated || a.id.localeCompare(b.id)
}
