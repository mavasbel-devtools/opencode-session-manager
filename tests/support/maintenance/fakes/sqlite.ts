import type { Fingerprint, IntegrityReport, JournalMode, PageStats } from "#domain/model/Database.ts"
import type { SqlitePort } from "#domain/ports/outbound/SqlitePort.ts"

export interface FakeSqliteOptions {
  readonly pages?: PageStats
  readonly fingerprint?: Fingerprint
  readonly targetFingerprint?: Fingerprint
  readonly integrity?: IntegrityReport
  readonly targetJournal?: JournalMode
  readonly onVacuum?: (source: string, target: string) => void
}

const EMPTY_PAGES: PageStats = {
  page_size: 4096,
  page_count: 10,
  freelist_count: 0,
  logical_bytes: 40960,
  free_bytes: 0,
  auto_vacuum: 0,
}

const EMPTY_FINGERPRINT: Fingerprint = { schema: [], header: { userVersion: 0, applicationId: 0 }, tables: {} }

const OK_INTEGRITY: IntegrityReport = { integrity_ok: true, integrity: ["ok"], foreign_key_violations: 0 }

/** Scripted SQLite port. Records what it was asked, and lets a test tamper the target "after vacuum". */
export class FakeSqlite implements SqlitePort {
  public readonly calls: string[] = []
  public pages: PageStats
  public source: Fingerprint
  public target: Fingerprint
  public integrityReport: IntegrityReport
  public targetJournal: JournalMode
  private readonly onVacuum: (source: string, target: string) => void

  constructor(options: FakeSqliteOptions = {}) {
    this.pages = options.pages ?? EMPTY_PAGES
    this.source = options.fingerprint ?? EMPTY_FINGERPRINT
    this.target = options.targetFingerprint ?? options.fingerprint ?? EMPTY_FINGERPRINT
    this.integrityReport = options.integrity ?? OK_INTEGRITY
    this.targetJournal = options.targetJournal ?? "wal"
    this.onVacuum = options.onVacuum ?? (() => {})
  }

  pageStats(dbPath: string): PageStats {
    this.calls.push(`pageStats:${dbPath}`)
    return this.pages
  }

  journalMode(dbPath: string): JournalMode {
    this.calls.push(`journalMode:${dbPath}`)
    return this.targetJournal
  }

  fingerprint(dbPath: string): Fingerprint {
    this.calls.push(`fingerprint:${dbPath}`)
    return dbPath.includes("compact") ? this.target : this.source
  }

  integrity(dbPath: string): IntegrityReport {
    this.calls.push(`integrity:${dbPath}`)
    return this.integrityReport
  }

  vacuumInto(source: string, target: string): void {
    this.calls.push(`vacuumInto:${source}->${target}`)
    this.onVacuum(source, target)
  }

  setWal(dbPath: string): void {
    this.calls.push(`setWal:${dbPath}`)
  }
}
