import { asc, count, eq } from "drizzle-orm"
import type { SQLiteColumn, SQLiteTable } from "drizzle-orm/sqlite-core"
import type { SessionGeneration, StoredSession } from "@session-manager/domain/model/SessionCatalog"
import type { SessionStorePort } from "@session-manager/domain/ports/outbound/SessionStorePort"
import { type Row, withStore } from "@session-manager/infrastructure/adapters/outbound/sqlite/engine/Store"
import { message, session, sessionMessage, sessionV2 } from "@session-manager/infrastructure/adapters/outbound/sqlite/schema/opencode"

/** One generation's tables: the session table and the table its messages or entries live in. */
const GENERATIONS: readonly {
  readonly generation: SessionGeneration
  readonly sessions: typeof session | typeof sessionV2
  readonly entries: SQLiteTable & { session_id: SQLiteColumn }
}[] = [
  { generation: "v1", sessions: session, entries: message },
  { generation: "v2", sessions: sessionV2, entries: sessionMessage },
]

const number = (cell: unknown): number | null => (cell === null || cell === undefined ? null : Number(cell))
const text = (cell: unknown): string | null => (cell === null || cell === undefined ? null : String(cell))

/** Reads sessions from an `opencode.db`, read-only; a column an older store lacks reads as null. */
export class BunSessionStoreAdapter implements SessionStorePort {
  constructor() {}

  sessions(dbPath: string): readonly StoredSession[] {
    return withStore(dbPath, "read", (store) =>
      GENERATIONS.filter((entry) => store.has(entry.sessions)).flatMap((entry) => {
        const counts = new Map<string, number>()
        if (store.has(entry.entries, ["session_id"]))
          for (const row of store.orm.select({ id: entry.entries.session_id, n: count() }).from(entry.entries).groupBy(entry.entries.session_id).all())
            counts.set(String(row.id), row.n)
        const columns = { ...store.selection(entry.sessions), ...store.pick(entry.sessions, ["id", "project_id", "directory", "time_created", "time_updated"]) }
        const rows = store.orm.select(columns).from(entry.sessions).all() as Row[]
        return rows.map(
          (row): StoredSession => ({
            id: String(row["id"]),
            generation: entry.generation,
            projectId: String(row["project_id"]),
            parentId: text(row["parent_id"]),
            forkOf: text(row["fork_session_id"]),
            title: text(row["title"]),
            directory: String(row["directory"]),
            timeCreated: number(row["time_created"])!,
            timeUpdated: number(row["time_updated"])!,
            timeArchived: number(row["time_archived"]),
            entries: counts.get(String(row["id"])) ?? 0,
          }),
        )
      }),
    )
  }

  messageIds(dbPath: string, sessionId: string, generation: SessionGeneration): readonly string[] {
    return withStore(dbPath, "read", (store) => {
      // v2 entries are ordered by `seq`; v1 messages by creation time, their ids breaking ties as OpenCode 1 does.
      const rows =
        generation === "v2"
          ? store.orm.select({ id: sessionMessage.id }).from(sessionMessage).where(eq(sessionMessage.session_id, sessionId)).orderBy(asc(sessionMessage.seq), asc(sessionMessage.id)).all()
          : store.orm.select({ id: message.id }).from(message).where(eq(message.session_id, sessionId)).orderBy(asc(message.time_created), asc(message.id)).all()
      return rows.map((row) => String(row.id))
    })
  }
}
