import { createHash } from "node:crypto"
import { openSync, closeSync, readSync, existsSync } from "node:fs"
import { Database } from "bun:sqlite"
import { TargetExistsError } from "@session-manager/domain/errors/TargetExistsError"
import type { Fingerprint, IntegrityReport, JournalMode, PageStats } from "@session-manager/domain/model/Database"
import type { SqlitePort } from "@session-manager/domain/ports/outbound/SqlitePort"

/** Read every integer as a BigInt, so a row is hashed or copied exactly; bun-types 1.4.2 does not declare `Statement.safeIntegers`. */
function readExactIntegers(statement: object): void {
  ;(statement as { safeIntegers(enabled: boolean): unknown }).safeIntegers(true)
}

interface FingerprintRow {
  readonly type: string
  readonly name: string
  readonly tbl_name: string
  readonly sql: string | null
}

interface TableInfoRow {
  readonly name: string
  readonly pk: number
}

function encodeValue(value: unknown): unknown {
  if (value instanceof Uint8Array) return { b: Buffer.from(value).toString("hex") }
  if (typeof value === "bigint") return { i: value.toString() }
  return value
}

/** The only place `bun:sqlite` is used for compaction. Every connection to the source database is read-only. */
export class BunSqliteAdapter implements SqlitePort {
  constructor() {}

  pageStats(dbPath: string): PageStats {
    const db = new Database(dbPath, { readonly: true })
    try {
      const get = (pragma: string): number => {
        const row = db.query(`pragma ${pragma}`).get() as Record<string, unknown> | undefined
        return Number(Object.values(row ?? {})[0])
      }
      const pageSize = get("page_size")
      const pageCount = get("page_count")
      const freelistCount = get("freelist_count")
      return {
        page_size: pageSize,
        page_count: pageCount,
        freelist_count: freelistCount,
        logical_bytes: pageSize * pageCount,
        free_bytes: pageSize * freelistCount,
        auto_vacuum: get("auto_vacuum"),
      }
    } finally {
      db.close()
    }
  }

  /** Header bytes 18/19 are 2/2 for WAL and 1/1 for a rollback-journal database. */
  journalMode(dbPath: string): JournalMode {
    const descriptor = openSync(dbPath, "r")
    try {
      const header = Buffer.alloc(20)
      readSync(descriptor, header, 0, 20, 0)
      return header[18] === 2 && header[19] === 2 ? "wal" : "delete"
    } finally {
      closeSync(descriptor)
    }
  }

  /** Schema, header values and a SHA-256 over every row of every table, rows ordered by primary key. */
  fingerprint(dbPath: string): Fingerprint {
    const db = new Database(dbPath, { readonly: true })
    try {
      const schemaRows = db
        .query("select type, name, tbl_name, sql from sqlite_master order by type, name")
        .all() as unknown as FingerprintRow[]
      const headerRow = db.query("pragma user_version").get() as { user_version: number }
      const applicationRow = db.query("pragma application_id").get() as { application_id: number }
      const tables: Record<string, { rows: number; sha256: string }> = {}
      for (const entry of schemaRows.filter((row) => row.type === "table")) {
        const quoted = `"${entry.name.replaceAll('"', '""')}"`
        const statement = db.query(`select * from ${quoted} order by ${this.orderColumns(db, entry.name).join(", ")}`)
        readExactIntegers(statement)
        const hash = createHash("sha256")
        let rows = 0
        for (const row of statement.iterate() as IterableIterator<Record<string, unknown>>) {
          const line = JSON.stringify(Object.entries(row).map(([key, value]) => [key, encodeValue(value)]))
          hash.update(`${line.length}:${line}\n`)
          rows++
        }
        tables[entry.name] = { rows, sha256: hash.digest("hex") }
      }
      return {
        schema: schemaRows.map((row) => ({
          type: row.type,
          name: row.name,
          tblName: row.tbl_name,
          sql: row.sql,
        })),
        header: { userVersion: Number(headerRow.user_version), applicationId: Number(applicationRow.application_id) },
        tables,
      }
    } finally {
      db.close()
    }
  }

  integrity(dbPath: string): IntegrityReport {
    const db = new Database(dbPath, { readonly: true })
    try {
      const integrity = db
        .query("pragma integrity_check")
        .all()
        .map((row) => (row as { integrity_check: string }).integrity_check)
      const foreignKeys = db.query("pragma foreign_key_check").all()
      return {
        integrity_ok: integrity.length === 1 && integrity[0] === "ok",
        integrity,
        foreign_key_violations: foreignKeys.length,
      }
    } finally {
      db.close()
    }
  }

  /** VACUUM INTO from a read-only connection: the source file is never written. */
  vacuumInto(source: string, target: string): void {
    if (existsSync(target)) throw new TargetExistsError(target)
    const db = new Database(source, { readonly: true })
    try {
      db.query("vacuum into ?").run(target)
    } finally {
      db.close()
    }
  }

  setWal(dbPath: string): void {
    const db = new Database(dbPath)
    try {
      db.exec("pragma journal_mode = wal")
    } finally {
      db.close()
    }
  }

  private orderColumns(db: Database, table: string): readonly string[] {
    const columns = db.query(`pragma table_info("${table.replaceAll('"', '""')}")`).all() as unknown as TableInfoRow[]
    const keys = columns.filter((column) => column.pk > 0).sort((a, b) => a.pk - b.pk)
    return (keys.length > 0 ? keys : columns).map((column) => `"${column.name.replaceAll('"', '""')}"`)
  }
}
