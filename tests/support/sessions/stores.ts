import { Database } from "bun:sqlite"
import { mkdirSync } from "node:fs"
import { dirname } from "node:path"

export interface SessionSpec {
  readonly id: string
  readonly project?: string
  readonly parent?: string | null
  readonly fork?: string | null
  readonly title?: string | null
  readonly directory: string
  readonly created?: number
  readonly updated: number
  readonly archived?: number | null
  readonly entries?: number
}

/**
 * A minimal OpenCode store with the columns the catalog reads. `v1` and `v2` sessions go to their
 * own tables; `legacyV2` drops the v2 columns an older store lacks (parent, fork, title, archive).
 */
export function makeOpenCodeStore(
  file: string,
  sessions: { readonly v1?: readonly SessionSpec[]; readonly v2?: readonly SessionSpec[] },
  options: { readonly legacyV2?: boolean; readonly withoutEntries?: boolean } = {},
): void {
  mkdirSync(dirname(file), { recursive: true })
  const db = new Database(file)
  try {
    db.exec(`create table session (id text primary key, project_id text not null, parent_id text, title text,
      directory text not null, time_created integer not null, time_updated integer not null, time_archived integer)`)
    db.exec(
      options.legacyV2
        ? "create table session_v2 (id text primary key, project_id text not null, directory text not null, time_created integer not null, time_updated integer not null)"
        : `create table session_v2 (id text primary key, project_id text not null, parent_id text, fork_session_id text, title text,
           directory text not null, time_created integer not null, time_updated integer not null, time_archived integer)`,
    )
    if (!options.withoutEntries) {
      db.exec("create table message (id text primary key, session_id text not null, data text)")
      db.exec("create table session_message (id text primary key, session_id text not null, seq integer, data text)")
    }
    const v1 = db.query("insert into session values (?, ?, ?, ?, ?, ?, ?, ?)")
    const v2 = options.legacyV2
      ? db.query("insert into session_v2 values (?, ?, ?, ?, ?)")
      : db.query("insert into session_v2 values (?, ?, ?, ?, ?, ?, ?, ?, ?)")
    const entry = (table: string, id: string, count: number) => {
      if (options.withoutEntries) return
      const insert = db.query(`insert into ${table} (id, session_id) values (?, ?)`)
      for (let index = 0; index < count; index++) insert.run(`${id}-m${index}`, id)
    }
    db.transaction(() => {
      for (const s of sessions.v1 ?? []) {
        v1.run(s.id, s.project ?? "global", s.parent ?? null, s.title ?? null, s.directory, s.created ?? 1, s.updated, s.archived ?? null)
        entry("message", s.id, s.entries ?? 0)
      }
      for (const s of sessions.v2 ?? []) {
        if (options.legacyV2) v2.run(s.id, s.project ?? "global", s.directory, s.created ?? 1, s.updated)
        else
          v2.run(s.id, s.project ?? "global", s.parent ?? null, s.fork ?? null, s.title ?? null, s.directory, s.created ?? 1, s.updated, s.archived ?? null)
        entry("session_message", s.id, s.entries ?? 0)
      }
    })()
  } finally {
    db.close()
  }
}

export interface ContextSpec {
  readonly version?: number
  readonly compartments?: Readonly<Record<string, number>>
  readonly tags?: Readonly<Record<string, number>>
  readonly notes?: Readonly<Record<string, number>>
  readonly memories?: Readonly<Record<string, number>>
  readonly projects?: Readonly<Record<string, string>>
  /** Tables an older format lacks. */
  readonly omit?: readonly string[]
}

/** A minimal Magic Context store with the tables the catalog reads. */
export function makeContextStore(file: string, spec: ContextSpec): void {
  mkdirSync(dirname(file), { recursive: true })
  const db = new Database(file)
  const omit = new Set(spec.omit ?? [])
  const table = (name: string, sql: string) => {
    if (!omit.has(name)) db.exec(sql)
  }
  try {
    table("schema_migrations", "create table schema_migrations (version integer primary key, description text not null, applied_at integer not null)")
    table("compartments", "create table compartments (id integer primary key autoincrement, session_id text not null, title text)")
    table("tags", "create table tags (id integer primary key autoincrement, session_id text, tag_number integer)")
    table("notes", "create table notes (id integer primary key autoincrement, session_id text, content text)")
    table("memories", "create table memories (id integer primary key autoincrement, project_path text, source_session_id text)")
    table("session_projects", "create table session_projects (session_id text not null, harness text not null default 'opencode', project_path text not null, primary key (session_id, harness))")
    db.transaction(() => {
      if (!omit.has("schema_migrations") && spec.version !== undefined)
        for (let version = 1; version <= spec.version; version++) db.query("insert into schema_migrations values (?, 'step', 0)").run(version)
      const rows = (name: string, counts: Readonly<Record<string, number>> | undefined, insert: (id: string, index: number) => void) => {
        if (omit.has(name)) return
        for (const [id, count] of Object.entries(counts ?? {})) for (let index = 0; index < count; index++) insert(id, index)
      }
      rows("compartments", spec.compartments, (id) => db.query("insert into compartments (session_id, title) values (?, 't')").run(id))
      rows("tags", spec.tags, (id, index) => db.query("insert into tags (session_id, tag_number) values (?, ?)").run(id, index + 1))
      rows("notes", spec.notes, (id) => db.query("insert into notes (session_id, content) values (?, 'n')").run(id))
      rows("memories", spec.memories, (id) => db.query("insert into memories (project_path, source_session_id) values ('dir:x', ?)").run(id))
      if (!omit.has("session_projects"))
        for (const [id, project] of Object.entries(spec.projects ?? {}))
          db.query("insert into session_projects (session_id, harness, project_path) values (?, 'opencode', ?)").run(id, project)
      if (!omit.has("tags")) db.query("insert into tags (session_id, tag_number) values (null, 1)").run()
      if (!omit.has("notes")) db.query("insert into notes (session_id, content) values (null, 'project note')").run()
      if (!omit.has("memories")) db.query("insert into memories (project_path, source_session_id) values ('dir:x', null)").run()
      if (!omit.has("session_projects")) db.query("insert into session_projects values ('ses_pi', 'pi', 'dir:pi')").run()
    })()
  } finally {
    db.close()
  }
}
