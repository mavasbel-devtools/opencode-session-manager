import { createHash } from "node:crypto"
import { closeSync, existsSync, openSync, readSync } from "node:fs"
import { TargetExistsError } from "@session-manager/domain/errors/TargetExistsError"
import type { Fingerprint, IntegrityReport, JournalMode, PageStats } from "@session-manager/domain/model/Database"
import type { SqlitePort } from "@session-manager/domain/ports/outbound/SqlitePort"
import { withStore } from "@session-manager/infrastructure/adapters/outbound/sqlite/engine/Store"

function encodeValue(value: unknown): unknown {
  if (value instanceof Uint8Array) return { b: Buffer.from(value).toString("hex") }
  if (typeof value === "bigint") return { i: value.toString() }
  return value
}

/** Compaction's view of a database, through the store engine. Every connection to the source database is read-only. */
export class BunSqliteAdapter implements SqlitePort {
  constructor() {}

  pageStats(dbPath: string): PageStats {
    return withStore(dbPath, "read", (store) => {
      const pragmas = store.pragmas()
      return {
        page_size: pragmas.page_size,
        page_count: pragmas.page_count,
        freelist_count: pragmas.freelist_count,
        logical_bytes: pragmas.page_size * pragmas.page_count,
        free_bytes: pragmas.page_size * pragmas.freelist_count,
        auto_vacuum: pragmas.auto_vacuum,
      }
    })
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
    return withStore(dbPath, "read", (store) => {
      const schema = store.schema()
      const pragmas = store.pragmas()
      const tables: Record<string, { rows: number; sha256: string }> = {}
      for (const entry of schema.filter((row) => row.type === "table")) {
        const hash = createHash("sha256")
        let rows = 0
        for (const row of store.rowsOf(entry.name)) {
          const line = JSON.stringify(Object.entries(row).map(([key, value]) => [key, encodeValue(value)]))
          hash.update(`${line.length}:${line}\n`)
          rows++
        }
        tables[entry.name] = { rows, sha256: hash.digest("hex") }
      }
      return {
        schema: schema.map((row) => ({ type: row.type, name: row.name, tblName: row.tbl_name, sql: row.sql })),
        header: { userVersion: pragmas.user_version, applicationId: pragmas.application_id },
        tables,
      }
    })
  }

  integrity(dbPath: string): IntegrityReport {
    return withStore(dbPath, "read", (store) => {
      const integrity = store.integrity()
      return { integrity_ok: integrity.length === 1 && integrity[0] === "ok", integrity, foreign_key_violations: store.foreignKeyViolations() }
    })
  }

  /** VACUUM INTO from a read-only connection: the source file is never written. */
  vacuumInto(source: string, target: string): void {
    if (existsSync(target)) throw new TargetExistsError(target)
    withStore(source, "read", (store) => store.vacuumInto(target))
  }

  setWal(dbPath: string): void {
    withStore(dbPath, "write", (store) => store.setWal())
  }
}
