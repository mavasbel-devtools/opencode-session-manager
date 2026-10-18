import { Database } from "bun:sqlite"
import { mkdirSync, readFileSync } from "node:fs"
import { dirname } from "node:path"
import { runScript } from "@test/support/sessions/sql-script"

/** OpenCode 2.0.24's store schema, every table and index as OpenCode creates them. */
export const SCHEMA_2_0_24 = readFileSync(new URL("./opencode-2.0.24.sql", import.meta.url), "utf8")
export const MIGRATIONS = ["20260910120000_clear_v1_session_permission", "20260923013825_project_time_active"] as const
/** OpenCode 2.0.32's store schema (2.0.24's plus `project.time_archived`), and the migrations that end in it. */
export const SCHEMA_2_0_32 = readFileSync(new URL("./opencode-2.0.32.sql", import.meta.url), "utf8")
export const MIGRATIONS_2_0_32 = [...MIGRATIONS, "20261007190000_azure_cli_external_credential", "20261010180456_project_time_archived"] as const

/** A content-addressed instruction blob every session with instruction state names. */
export const BLOB_HASH = "a".repeat(64)

export interface ProjectSpec {
  readonly id: string
  readonly worktree: string
  readonly name?: string
}

export interface StoreSessionSpec {
  readonly id: string
  readonly directory: string
  readonly projectId?: string
  readonly parentId?: string
  readonly title?: string
  /** Entry ids, in order (default: `<id>-m0`, `<id>-m1`). Each entry's text names the session's folder. */
  readonly entries?: readonly string[]
  readonly metadata?: string
  /** Also an OpenCode 1 row with a message, a part and a todo (as OpenCode 2 keeps after migrating). */
  readonly v1?: boolean
  /** Only the OpenCode 1 rows. */
  readonly v1Only?: boolean
  /** Inbox, pending input, instruction state and entry, its event log and two plugin storage keys. */
  readonly extras?: boolean
}

export interface OpenCodeStoreSpec {
  readonly projects?: readonly ProjectSpec[]
  readonly sessions?: readonly StoreSessionSpec[]
  readonly migrations?: readonly string[]
  /** The OpenCode version whose schema the store has (default 2.0.24). */
  readonly schema?: "2.0.24" | "2.0.32"
  /** SQL run last. */
  readonly extraSql?: string
}

/** A store with OpenCode 2.0.24's (or 2.0.32's) real schema and the given projects and sessions. */
export function makeOpenCode2Store(file: string, spec: OpenCodeStoreSpec): void {
  mkdirSync(dirname(file), { recursive: true })
  const db = new Database(file)
  try {
    db.exec(spec.schema === "2.0.32" ? SCHEMA_2_0_32 : SCHEMA_2_0_24)
    db.transaction(() => {
      for (const id of spec.migrations ?? (spec.schema === "2.0.32" ? MIGRATIONS_2_0_32 : MIGRATIONS)) db.query("insert into migration values (?, 1)").run(id)
      db.query("insert into project (id, worktree, time_created, time_updated, sandboxes) values ('global', '/', 1, 1, '[]')").run()
      for (const project of spec.projects ?? [])
        db.query("insert into project (id, worktree, vcs, name, time_created, time_updated, sandboxes) values (?, ?, 'git', ?, 2, 2, '[]')").run(
          project.id,
          project.worktree,
          project.name ?? null,
        )
      for (const session of spec.sessions ?? []) addSession(db, session)
    })()
    if (spec.extraSql !== undefined) runScript(db, spec.extraSql)
  } finally {
    db.close()
  }
}

function addSession(db: Database, session: StoreSessionSpec): void {
  const project = session.projectId ?? "global"
  const entries = session.entries ?? [`${session.id}-m0`, `${session.id}-m1`]
  const text = JSON.stringify({ cwd: session.directory, text: `edited ${session.directory}/file.ts` })
  if (session.v1 === true || session.v1Only === true) {
    db.query("insert into session (id, project_id, parent_id, slug, directory, title, version, time_created, time_updated) values (?, ?, ?, 'slug', ?, ?, '1.18', 1, 2)").run(
      session.id,
      project,
      session.parentId ?? null,
      session.directory,
      session.title ?? session.id,
    )
    db.query("insert into message values (?, ?, 1, 1, ?)").run(`${session.id}-v1m0`, session.id, text)
    db.query("insert into part values (?, ?, ?, 1, 1, ?)").run(`${session.id}-v1p0`, `${session.id}-v1m0`, session.id, text)
    db.query("insert into todo values (?, ?, 'pending', 'high', 0, 1, 1)").run(session.id, `check ${session.directory}`)
  }
  if (session.v1Only === true) return
  db.query(
    "insert into session_v2 (id, project_id, parent_id, slug, directory, title, version, metadata, time_created, time_updated) values (?, ?, ?, 'slug', ?, ?, '2.0.24', ?, 1, 2)",
  ).run(session.id, project, session.parentId ?? null, session.directory, session.title ?? session.id, session.metadata ?? null)
  for (const [seq, id] of entries.entries()) db.query("insert into session_message values (?, ?, 'user', ?, 1, 1, ?)").run(id, session.id, seq, text)
  if (session.extras !== true) return
  const last = entries.length + 2
  db.query("insert into event_sequence values (?, ?, null)").run(session.id, last)
  db.query("insert into event values (?, ?, ?, 'session.updated.1', ?, 0)").run(`evt_${session.id}`, session.id, last, text)
  db.query("insert into session_inbox values (?, ?, 'synthetic', ?, 'steer', ?, 1)").run(`inb_${session.id}`, session.id, text, last)
  db.query("insert into session_pending values (?, ?, 'prompt', ?, null, ?, 1)").run(`pen_${session.id}`, session.id, text, last)
  db.query("insert into instruction_state values (?, 0, ?, ?, ?)").run(session.id, last, JSON.stringify({ "core/environment": BLOB_HASH }), JSON.stringify({ "core/environment": BLOB_HASH }))
  db.query("insert into instruction_entry values (?, 'core/environment', ?, 0, 1, 1)").run(session.id, JSON.stringify(BLOB_HASH))
  db.query("insert or ignore into instruction_blob values (?, ?)").run(BLOB_HASH, JSON.stringify({ cwd: session.directory }))
  db.query("insert into kv values (?, ?, 1, 1)").run(`plugin:00ab:fold/v1/${session.id}`, JSON.stringify({ submitted: session.directory }))
  db.query("insert into kv values (?, ?, 1, 1)").run(`plugin:00ab:synthetic/${session.id}/msg_1`, JSON.stringify({ id: "msg_1" }))
}
