import { Database } from "bun:sqlite"
import { mkdirSync, readFileSync } from "node:fs"
import { dirname } from "node:path"
import type { Harness } from "@session-manager/domain/model/MagicContextSync"
import { normalizedHash } from "@session-manager/infrastructure/adapters/outbound/sqlite/BunMagicContextSyncStoreAdapter"

/** Every table, index and trigger of a Magic Context 0.45.0 store (format 94), read from a real one. */
export const SCHEMA_94 = readFileSync(new URL("./magic-context-94.sql", import.meta.url), "utf8")

/** The same for Magic Context 0.47.0 (format 95): format 94 plus `temporal_decisions` and `git_commit_fts_rowid_map`. */
export const SCHEMA_95 = readFileSync(new URL("./magic-context-95.sql", import.meta.url), "utf8")

export interface CompartmentSpec {
  readonly start: string
  readonly end: string
  readonly content?: string
}

export interface MemorySpec {
  readonly content: string
  readonly category?: string
  readonly status?: string
  /** The session that created it; defaults to the session it is listed under. */
  readonly from?: string
  readonly embedded?: boolean
}

export interface StateSpec {
  readonly harness?: Harness
  readonly compartments?: readonly CompartmentSpec[]
  /** Tags 1..n on the session's first message, each with its source content; tag 1 has a pending drop. */
  readonly tags?: number
  readonly notes?: readonly string[]
  readonly facts?: readonly string[]
  readonly memories?: readonly MemorySpec[]
  readonly project?: string | null
  /** A session_meta row with cached context snapshots. */
  readonly meta?: boolean
  /** A chunk embedding and an event for each compartment. */
  readonly extras?: boolean
}

export interface SyncStoreSpec {
  readonly format?: number
  readonly sessions?: Readonly<Record<string, StateSpec>>
  /** Tables dropped after the schema is created, to stand for an older or partial store. */
  readonly without?: readonly string[]
  /** SQL run last (for example a trigger that makes the store misbehave). */
  readonly extraSql?: string
}

/** A Magic Context store with the real tables of its format (95 from 95 on, else 94) and the given per-session state. */
export function makeSyncContextStore(file: string, spec: SyncStoreSpec): void {
  mkdirSync(dirname(file), { recursive: true })
  const db = new Database(file)
  try {
    db.exec((spec.format ?? 94) >= 95 ? SCHEMA_95 : SCHEMA_94)
    db.query("insert into schema_migrations (version, description, applied_at) values (?, 'fixture', 0)").run(spec.format ?? 94)
    db.transaction(() => {
      for (const [id, state] of Object.entries(spec.sessions ?? {})) addState(db, id, state)
    })()
    for (const table of spec.without ?? []) {
      // A trigger on another table that writes into this one would fail once it is gone.
      for (const trigger of db.query("select name from sqlite_master where type = 'trigger' and (tbl_name = ? or sql like ?)").all(table, `%${table}%`) as { name: string }[])
        db.exec(`drop trigger if exists "${trigger.name}"`)
      db.exec(`drop table ${table}`)
    }
    if (spec.extraSql !== undefined) db.exec(spec.extraSql)
  } finally {
    db.close()
  }
}

function addState(db: Database, id: string, state: StateSpec): void {
  const harness = state.harness ?? "opencode2"
  const project = state.project === undefined ? "dir:source" : state.project
  for (const [sequence, compartment] of (state.compartments ?? []).entries()) {
    const inserted = db
      .query(
        `insert into compartments (session_id, sequence, start_message, end_message, start_message_id, end_message_id, title, content, created_at, harness)
         values (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      )
      .run(id, sequence, sequence, sequence, compartment.start, compartment.end, `Summary ${sequence}`, compartment.content ?? `summary ${sequence} of ${id}`, harness)
    if (state.extras) {
      db.query(
        `insert into compartment_chunk_embeddings (compartment_id, session_id, project_path, harness, start_ordinal, end_ordinal, chunk_hash, model_id, dims, vector, created_at)
         values (?, ?, ?, ?, 0, 1, 'hash', 'model', 2, ?, 1)`,
      ).run(Number(inserted.lastInsertRowid), id, project ?? "dir:none", harness, new Uint8Array([1, 2]))
      db.query("insert into compartment_events (session_id, compartment_id, kind, created_at, harness) values (?, ?, 'created', 1, ?)").run(
        id,
        Number(inserted.lastInsertRowid),
        harness,
      )
    }
  }
  if (state.extras) db.query("insert into compartment_events (session_id, compartment_id, kind, created_at, harness) values (?, null, 'note', 1, ?)").run(id, harness)
  for (let tag = 1; tag <= (state.tags ?? 0); tag++) {
    db.query("insert into tags (session_id, message_id, type, tag_number, harness) values (?, ?, 'message', ?, ?)").run(id, `${id}-m0:p${tag}`, tag, harness)
    db.query("insert into source_contents (tag_id, session_id, content, created_at, harness) values (?, ?, ?, 1, ?)").run(tag, id, `content of tag ${tag}`, harness)
  }
  if ((state.tags ?? 0) > 0) db.query("insert into pending_ops (session_id, tag_id, operation, queued_at, harness) values (?, 1, 'drop', 1, ?)").run(id, harness)
  for (const content of state.notes ?? [])
    db.query("insert into notes (type, content, session_id, project_path, created_at, updated_at, harness) values ('session', ?, ?, ?, 1, 1, ?)").run(
      content,
      id,
      project,
      harness,
    )
  for (const content of state.facts ?? [])
    db.query("insert into session_facts (session_id, category, content, created_at, updated_at, harness) values (?, 'fact', ?, 1, 1, ?)").run(id, content, harness)
  for (const memory of state.memories ?? []) {
    const inserted = db
      .query(
        `insert into memories (project_path, category, content, normalized_hash, source_session_id, first_seen_at, created_at, updated_at, last_seen_at, status)
         values (?, ?, ?, ?, ?, 1, 1, 1, 1, ?)`,
      )
      .run(project ?? "dir:none", memory.category ?? "fact", memory.content, normalizedHash(memory.content), memory.from ?? id, memory.status ?? "active")
    if (memory.embedded) db.query("insert into memory_embeddings (memory_id, embedding, model_id) values (?, ?, 'model')").run(Number(inserted.lastInsertRowid), new Uint8Array([3]))
  }
  if (project !== null) db.query("insert into session_projects (session_id, harness, project_path, updated_at) values (?, ?, ?, 1)").run(id, harness, project)
  // Inserting tags already made a session_meta row (Magic Context's `tags_version_ai` trigger).
  if (state.meta)
    db.query(
      "insert into session_meta (session_id, harness, counter, cached_m0_bytes) values (?, ?, 1, 'cached') on conflict(session_id) do update set counter = 1, cached_m0_bytes = 'cached'",
    ).run(id, harness)
}

export interface ContextRow {
  readonly [column: string]: unknown
}

/** Rows of a store's table for a session, for assertions. */
export function rowsOf(file: string, sql: string, ...params: (string | number)[]): ContextRow[] {
  const db = new Database(file, { readonly: true })
  try {
    return db.query(sql).all(...params) as ContextRow[]
  } finally {
    db.close()
  }
}
