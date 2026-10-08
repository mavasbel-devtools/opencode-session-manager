/**
 * Shape of the OpenCode database as this tool reads it. Every field is a plain value: the type
 * strips cleanly and carries no Node type into the domain.
 */

/** Size in bytes of each of `db`, `db-wal`, `db-shm`; `null` for a file that does not exist. */
export type SidecarSizes = Readonly<Record<string, number | null>>

export interface PageStats {
  readonly page_size: number
  readonly page_count: number
  readonly freelist_count: number
  readonly logical_bytes: number
  readonly free_bytes: number
  readonly auto_vacuum: number
}

/** One row of `sqlite_master`. */
export interface SchemaEntry {
  readonly type: string
  readonly name: string
  readonly tblName: string
  readonly sql: string | null
}

export interface DatabaseHeader {
  readonly userVersion: number
  readonly applicationId: number
}

export interface TableFingerprint {
  readonly rows: number
  readonly sha256: string
}

/** Schema, header values and a SHA-256 over every row of every table. */
export interface Fingerprint {
  readonly schema: readonly SchemaEntry[]
  readonly header: DatabaseHeader
  readonly tables: Readonly<Record<string, TableFingerprint>>
}

export interface IntegrityReport {
  readonly integrity_ok: boolean
  readonly integrity: readonly string[]
  readonly foreign_key_violations: number
}

export interface TableComparison {
  readonly name: string
  readonly source_rows: number | null
  readonly target_rows: number | null
  readonly match: boolean
}

export interface ComparisonResult {
  readonly ok: boolean
  readonly failures: readonly string[]
  readonly tables: readonly TableComparison[]
}

/** SQLite writes 2/2 in header bytes 18/19 for WAL and 1/1 for a rollback journal. */
export type JournalMode = "wal" | "delete"

export interface ProcessEntry {
  readonly image: string
  readonly pid: number
}

export interface Environment {
  readonly XDG_DATA_HOME?: string | undefined
}

/** The OpenCode database path: `$XDG_DATA_HOME/opencode/opencode.db`, or `~/.local/share` when unset. */
export function defaultDatabasePath(env: Environment, homeDirectory: string): string {
  const data = env.XDG_DATA_HOME ? env.XDG_DATA_HOME : `${homeDirectory}/.local/share`
  return `${data}/opencode/opencode.db`
}
