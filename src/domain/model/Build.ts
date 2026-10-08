import type { ComparisonResult, IntegrityReport, PageStats } from "@session-manager/domain/model/Database"

/** The six checks a compacted copy has to pass, in the order the CLI prints them. */
export interface BuildChecks {
  readonly integrity_ok: boolean
  readonly foreign_keys_ok: boolean
  readonly freelist_zero: boolean
  readonly parity_ok: boolean
  readonly journal_wal: boolean
  readonly no_target_sidecars: boolean
}

export interface BuildAndVerifyResult {
  /** True when every check the parity policy requires for this run passed. */
  readonly ok: boolean
  readonly checks: BuildChecks
  readonly vacuum_ms: number
  readonly total_ms: number
  readonly target_bytes: number
  readonly target_pages: PageStats
  readonly integrity: IntegrityReport
  readonly comparison: ComparisonResult
}
