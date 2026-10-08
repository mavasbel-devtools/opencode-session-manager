import { Database } from "bun:sqlite"
import type { MagicContextSessionStats, MagicContextSummary } from "@session-manager/domain/model/SessionCatalog"
import type { MagicContextStorePort } from "@session-manager/domain/ports/outbound/MagicContextStorePort"

type Counts = Map<string, { readonly n: number; readonly last?: number | null; readonly project?: string }>

/**
 * Reads a Magic Context `context.db`, read-only. Each count comes from its own table, and a table an
 * older format lacks counts as empty, so any format version can be listed.
 */
export class BunMagicContextStoreAdapter implements MagicContextStorePort {
  constructor() {}

  summary(dbPath: string): MagicContextSummary {
    const db = new Database(dbPath, { readonly: true })
    try {
      const tables = new Set(
        (db.query("select name from sqlite_master where type = 'table'").all() as { name: string }[]).map((row) => row.name),
      )
      const counts = (table: string, sql: string): Counts => {
        if (!tables.has(table)) return new Map()
        const rows = db.query(sql).all() as { id: string; n: number; last?: number | null; project?: string }[]
        return new Map(rows.map((row) => [row.id, row]))
      }
      const compartments = counts("compartments", "select session_id as id, count(*) as n from compartments group by session_id")
      const tags = counts("tags", "select session_id as id, count(*) as n, max(tag_number) as last from tags where session_id is not null group by session_id")
      const notes = counts("notes", "select session_id as id, count(*) as n from notes where session_id is not null group by session_id")
      const memories = counts(
        "memories",
        "select source_session_id as id, count(*) as n from memories where source_session_id is not null group by source_session_id",
      )
      const projects = counts(
        "session_projects",
        // OpenCode 1 sessions are labelled `opencode`, OpenCode 2 sessions `opencode2`; the later label wins.
        "select session_id as id, 1 as n, project_path as project from session_projects where harness in ('opencode', 'opencode2') order by harness",
      )
      const ids = new Set([...compartments.keys(), ...tags.keys(), ...notes.keys(), ...memories.keys(), ...projects.keys()])
      const sessions: Record<string, MagicContextSessionStats> = {}
      for (const id of ids) {
        sessions[id] = {
          compartments: compartments.get(id)?.n ?? 0,
          tags: tags.get(id)?.n ?? 0,
          lastTag: tags.get(id)?.last ?? null,
          notes: notes.get(id)?.n ?? 0,
          memoriesOriginated: memories.get(id)?.n ?? 0,
          project: projects.get(id)?.project ?? null,
        }
      }
      return { available: true, schemaVersion: formatOf(db, tables), sessions }
    } finally {
      db.close()
    }
  }

  formatVersion(dbPath: string): number | null {
    const db = new Database(dbPath, { readonly: true })
    try {
      const tables = new Set(
        (db.query("select name from sqlite_master where type = 'table'").all() as { name: string }[]).map((row) => row.name),
      )
      return formatOf(db, tables)
    } finally {
      db.close()
    }
  }
}

function formatOf(db: Database, tables: ReadonlySet<string>): number | null {
  if (!tables.has("schema_migrations")) return null
  return (db.query("select max(version) as v from schema_migrations").get() as { v: number | null }).v
}
