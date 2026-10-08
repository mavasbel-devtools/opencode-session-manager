import type { StoredSession } from "@session-manager/domain/model/SessionCatalog"

/** Outbound port: read-only access to an OpenCode session store (`opencode.db`). */
export interface SessionStorePort {
  /** Every v1 and v2 session in the store. Throws when the store cannot be read. */
  sessions(dbPath: string): readonly StoredSession[]
}
