import { Database } from "bun:sqlite"
import type { Fingerprint, IntegrityReport, JournalMode, PageStats } from "@session-manager/domain/model/Database"
import type { SqlitePort } from "@session-manager/domain/ports/outbound/SqlitePort"
import { RequiredSpacePolicy } from "@session-manager/domain/services/RequiredSpacePolicy"

/** Demands more space than any real disk has, so the guard's disk check runs against a real statfs. */
export class DemandingSpacePolicy extends RequiredSpacePolicy {
  override requiredBytes(): number {
    return Number.MAX_SAFE_INTEGER
  }

  override migrationBytes(): number {
    return Number.MAX_SAFE_INTEGER
  }
}

/**
 * The real SQLite adapter, with one real extra step: after the VACUUM INTO it deletes a row from
 * the copy, so the parity check fails for a genuine reason rather than a simulated one.
 */
export class TamperingSqlite implements SqlitePort {
  private readonly inner: SqlitePort
  private readonly statement: string

  constructor(inner: SqlitePort, statement: string) {
    this.inner = inner
    this.statement = statement
  }

  pageStats(dbPath: string): PageStats {
    return this.inner.pageStats(dbPath)
  }

  journalMode(dbPath: string): JournalMode {
    return this.inner.journalMode(dbPath)
  }

  fingerprint(dbPath: string): Fingerprint {
    return this.inner.fingerprint(dbPath)
  }

  integrity(dbPath: string): IntegrityReport {
    return this.inner.integrity(dbPath)
  }

  setWal(dbPath: string): void {
    this.inner.setWal(dbPath)
  }

  vacuumInto(source: string, target: string): void {
    this.inner.vacuumInto(source, target)
    const db = new Database(target)
    try {
      db.exec(this.statement)
    } finally {
      db.close()
    }
  }
}
