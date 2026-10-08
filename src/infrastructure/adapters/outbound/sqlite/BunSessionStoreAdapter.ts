import { Database } from "bun:sqlite"
import type { SessionGeneration, StoredSession } from "@session-manager/domain/model/SessionCatalog"
import type { SessionStorePort } from "@session-manager/domain/ports/outbound/SessionStorePort"

interface SessionRow {
  readonly id: string
  readonly projectId: string
  readonly parentId: string | null
  readonly forkOf: string | null
  readonly title: string | null
  readonly directory: string
  readonly timeCreated: number
  readonly timeUpdated: number
  readonly timeArchived: number | null
  readonly entries: number
}

/** One generation's tables: the session table and the table its messages or entries live in. */
const GENERATIONS: readonly { readonly generation: SessionGeneration; readonly sessions: string; readonly entries: string }[] = [
  { generation: "v1", sessions: "session", entries: "message" },
  { generation: "v2", sessions: "session_v2", entries: "session_message" },
]

/** Reads sessions from an `opencode.db`, read-only; a column an older store lacks reads as null. */
export class BunSessionStoreAdapter implements SessionStorePort {
  constructor() {}

  sessions(dbPath: string): readonly StoredSession[] {
    const db = new Database(dbPath, { readonly: true })
    try {
      const tables = new Set(
        (db.query("select name from sqlite_master where type = 'table'").all() as { name: string }[]).map((row) => row.name),
      )
      return GENERATIONS.filter((entry) => tables.has(entry.sessions)).flatMap((entry) => {
        const columns = new Set((db.query(`pragma table_info(${entry.sessions})`).all() as { name: string }[]).map((row) => row.name))
        const column = (name: string, alias: string) => `${columns.has(name) ? `s.${name}` : "null"} as ${alias}`
        const counts = tables.has(entry.entries)
          ? `left join (select session_id, count(*) as n from ${entry.entries} group by session_id) e on e.session_id = s.id`
          : "left join (select null as session_id, 0 as n) e on 0"
        const rows = db
          .query(
            `select s.id as id, s.project_id as projectId, ${column("parent_id", "parentId")}, ${column("fork_session_id", "forkOf")},
                    ${column("title", "title")}, s.directory as directory, s.time_created as timeCreated,
                    s.time_updated as timeUpdated, ${column("time_archived", "timeArchived")}, coalesce(e.n, 0) as entries
             from ${entry.sessions} s ${counts}`,
          )
          .all() as SessionRow[]
        return rows.map((row) => ({ ...row, generation: entry.generation }))
      })
    } finally {
      db.close()
    }
  }
}
