import type { SessionGeneration, StoredSession } from "@session-manager/domain/model/SessionCatalog"

/** Outbound port: read-only access to an OpenCode session store (`opencode.db`). */
export interface SessionStorePort {
  /** Every v1 and v2 session in the store. Throws when the store cannot be read. */
  sessions(dbPath: string): readonly StoredSession[]
  /** A session's message (v1) or entry (v2) ids, in order. */
  messageIds(dbPath: string, sessionId: string, generation: SessionGeneration): readonly string[]
}
