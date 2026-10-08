import type { Fingerprint, IntegrityReport, JournalMode, PageStats } from "@session-manager/domain/model/Database"

/** Everything this tool asks SQLite to do. The source database is only ever opened read-only. */
export interface SqlitePort {
  pageStats(dbPath: string): PageStats
  journalMode(dbPath: string): JournalMode
  fingerprint(dbPath: string): Fingerprint
  integrity(dbPath: string): IntegrityReport
  /** `VACUUM INTO` from a read-only source connection: the source file is never written. */
  vacuumInto(source: string, target: string): void
  /** Switches a database back to WAL after a VACUUM INTO (which always writes a rollback journal). */
  setWal(dbPath: string): void
}
