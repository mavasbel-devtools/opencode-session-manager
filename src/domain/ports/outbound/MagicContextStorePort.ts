import type { MagicContextSummary } from "@session-manager/domain/model/SessionCatalog"

/** Outbound port: read-only access to a Magic Context store (`context.db`). */
export interface MagicContextStorePort {
  /** Per-session counts and the store's format version. Throws when the store cannot be read. */
  summary(dbPath: string): MagicContextSummary
  /** The store's format version (`schema_migrations`), or null when it records none. */
  formatVersion(dbPath: string): number | null
}
