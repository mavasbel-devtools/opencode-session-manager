import { Database } from "bun:sqlite"
import { createHash } from "node:crypto"
import type { Harness } from "@session-manager/domain/model/MagicContextSync"
import type {
  CopyResult,
  MagicContextSyncStorePort,
  PlannedCopy,
  SourceSessionState,
  StoredSessionState,
  StoreHealth,
} from "@session-manager/domain/ports/outbound/MagicContextSyncStorePort"
import type { TextRewriter } from "@session-manager/domain/services/PathRewriter"

type Row = Record<string, unknown>

/**
 * The session-scoped tables a copy replaces, in Magic Context's own deletion order
 * (`SESSION_SCOPED_TABLES`, plugin `storage-session-tables.ts`). Caches, leases and in-progress work
 * (`compartment_state_lease`, `lkg_slots`, `recomp_*`) are cleared and rebuilt by Magic Context;
 * the message search index, run statistics and subagent records describe the target's own history
 * and are kept.
 */
const CLEARED = [
  "pending_ops",
  "source_contents",
  "tags",
  "compartment_chunk_embeddings",
  "compartments",
  "compression_depth",
  "session_facts",
  "compartment_state_lease",
  "recomp_compartments",
  "recomp_facts",
  "compartment_events",
  "lkg_slot_chunks",
  "lkg_slots",
] as const

/** Copied as rows, keyed by the session; `id` columns are reassigned by the target. */
const COPIED = ["tags", "source_contents", "pending_ops", "session_facts", "compression_depth"] as const

/** Text columns that hold keys, never prose: never rewritten. */
const KEYS = new Set(["session_id", "harness", "project_path", "message_id", "start_message_id", "end_message_id", "tool_owner_message_id", "normalized_hash"])

/**
 * Reads and writes session state in Magic Context stores. Only ever given working copies: a copy
 * attaches the source read-only and rewrites the target's rows for each session in one transaction.
 */
export class BunMagicContextSyncStoreAdapter implements MagicContextSyncStorePort {
  constructor() {}

  sourceState(contextDb: string, sessionId: string): SourceSessionState {
    return withDb(contextDb, true, (db) => {
      const tables = tablesOf(db, "main")
      const labels = new Set<string>()
      for (const table of ["compartments", "tags", "session_facts"])
        if (tables.has(table))
          for (const row of db.query(`select distinct harness from ${table} where session_id = ?`).all(sessionId) as { harness: string }[])
            labels.add(row.harness)
      const harness: Harness | null = labels.has("opencode2") ? "opencode2" : labels.has("opencode") ? "opencode" : null
      return {
        harness,
        anchors: harness === null ? [] : anchorsOf(db, sessionId, harness),
        project: recordedProjectOf(db, sessionId, harness),
        reach: harness === null || !tables.has("compartments") ? 0 : reachOf(db, sessionId, harness),
      }
    })
  }

  busy(contextDb: string, sessionId: string, now: number): boolean {
    return withDb(contextDb, true, (db) => {
      const tables = tablesOf(db, "main")
      if (tables.has("compartment_state_lease")) {
        const lease = db.query("select max(expires_at) as until from compartment_state_lease where session_id = ?").get(sessionId) as { until: number | null }
        if (lease.until !== null && lease.until > now) return true
      }
      if (!tables.has("session_meta")) return false
      const columns = new Set((db.query("pragma table_info(session_meta)").all() as { name: string }[]).map((row) => row.name))
      if (!columns.has("wrapup_in_progress_state")) return false
      const rows = db.query("select wrapup_in_progress_state as state from session_meta where session_id = ?").all(sessionId) as { state: string | null }[]
      return rows.some((row) => wrapupRunning(row.state, now))
    })
  }

  recordedProject(contextDb: string, sessionId: string): string | null {
    return withDb(contextDb, true, (db) => recordedProjectOf(db, sessionId, null))
  }

  copySessions(sourceDb: string, targetDb: string, copies: readonly PlannedCopy[]): readonly CopyResult[] {
    if (copies.length === 0) return []
    return withDb(targetDb, false, (db) => {
      db.query("attach database ? as src").run(sourceDb)
      try {
        const writer = new Writer(db)
        db.exec("begin immediate")
        try {
          const results = copies.map((planned) => writer.copy(planned))
          db.exec("commit")
          return results
        } catch (error) {
          db.exec("rollback")
          throw error
        }
      } finally {
        db.exec("detach database src")
      }
    })
  }

  stateOf(contextDb: string, sessionId: string): StoredSessionState {
    return withDb(contextDb, true, (db) => {
      const tables = tablesOf(db, "main")
      const count = (table: string, sql: string) => (tables.has(table) ? (db.query(sql).get(sessionId) as { n: number }).n : 0)
      return {
        compartments: count("compartments", "select count(*) as n from compartments where session_id = ?"),
        tags: count("tags", "select count(*) as n from tags where session_id = ?"),
        notes: count("notes", "select count(*) as n from notes where session_id = ? and type = 'session'"),
        anchors: anchorsOf(db, sessionId, null),
      }
    })
  }

  health(contextDb: string): StoreHealth {
    return withDb(contextDb, true, (db) => ({
      integrity_ok: (db.query("pragma integrity_check").all() as { integrity_check: string }[]).every((row) => row.integrity_check === "ok"),
      foreign_keys_ok: db.query("pragma foreign_key_check").all().length === 0,
    }))
  }
}

/** One copy transaction's writes into `main` from the attached `src`. */
class Writer {
  private readonly db: Database
  private readonly targetTables: ReadonlySet<string>
  private readonly sourceTables: ReadonlySet<string>
  private readonly columns = new Map<string, readonly string[]>()

  constructor(db: Database) {
    this.db = db
    this.targetTables = tablesOf(db, "main")
    this.sourceTables = tablesOf(db, "src")
  }

  copy({ copy, rewriter }: PlannedCopy): CopyResult {
    const { id, sourceHarness, targetHarness, targetProject } = copy
    let residual = 0
    const text = (value: unknown, column: string): unknown => {
      if (typeof value !== "string" || KEYS.has(column) || rewriter === null) return value
      const rewritten = rewriter.rewrite(value)
      if (rewriter.residual(rewritten)) residual++
      return rewritten
    }
    const both = (table: string) => this.targetTables.has(table) && this.sourceTables.has(table)

    for (const table of CLEARED)
      if (this.targetTables.has(table)) this.db.query(`delete from main.${table} where session_id = ?`).run(id)
    if (this.targetTables.has("notes")) this.db.query("delete from main.notes where session_id = ? and type = 'session'").run(id)

    const sourceRows = (table: string, extra = "") =>
      this.db.query(`select * from src.${table} where session_id = ? and harness = ?${extra}`).all(id, sourceHarness) as Row[]
    const fixed = { session_id: id, harness: targetHarness }

    const compartmentIds = new Map<number, number>()
    for (const row of both("compartments") ? sourceRows("compartments", " order by sequence") : [])
      compartmentIds.set(row["id"] as number, this.insert("compartments", row, fixed, text))
    if (both("compartment_chunk_embeddings"))
      for (const row of sourceRows("compartment_chunk_embeddings")) {
        const compartment = compartmentIds.get(row["compartment_id"] as number)
        if (compartment !== undefined)
          this.insert("compartment_chunk_embeddings", row, { ...fixed, compartment_id: compartment, project_path: targetProject }, text)
      }
    for (const table of COPIED) if (both(table)) for (const row of sourceRows(table)) this.insert(table, row, fixed, text)
    let notes = 0
    if (both("notes"))
      for (const row of sourceRows("notes", " and type = 'session'")) {
        this.insert("notes", row, { ...fixed, project_path: row["project_path"] === null ? null : targetProject }, text)
        notes++
      }
    if (both("compartment_events"))
      for (const row of sourceRows("compartment_events")) {
        const compartment = row["compartment_id"] === null ? null : (compartmentIds.get(row["compartment_id"] as number) ?? null)
        this.insert("compartment_events", row, { ...fixed, compartment_id: compartment }, text)
      }

    const tags = this.db.query("select count(*) as n, max(tag_number) as last from main.tags where session_id = ?").get(id) as { n: number; last: number | null }
    this.sessionRows(id, targetHarness, targetProject, tags.last ?? 0)
    const memories = copy.sourceProject === null ? { copied: 0, existing: 0 } : this.memories(id, copy.sourceProject, targetProject, rewriter, text)
    return {
      id,
      compartments: compartmentIds.size,
      tags: tags.n,
      notes,
      memories_copied: memories.copied,
      memories_already_there: memories.existing,
      residual_windows_paths: residual,
    }
  }

  /** The session's own bookkeeping: its project, its summary version, and dropped caches. */
  private sessionRows(id: string, harness: Harness, project: string, lastTag: number): void {
    const now = Date.now()
    if (this.targetTables.has("session_projects")) {
      this.db.query("delete from main.session_projects where session_id = ? and harness <> ?").run(id, harness)
      this.db
        .query(
          `insert into main.session_projects (session_id, harness, project_path, updated_at) values (?, ?, ?, ?)
           on conflict(session_id, harness) do update set project_path = excluded.project_path, updated_at = excluded.updated_at`,
        )
        .run(id, harness, project, now)
    }
    if (this.targetTables.has("session_meta")) {
      // As Magic Context's own session move does: drop the two cached context snapshots.
      const updated = this.db
        .query("update main.session_meta set cached_m0_bytes = null, cached_m1_bytes = null, counter = max(coalesce(counter, 0), ?) where session_id = ?")
        .run(lastTag, id)
      if (updated.changes === 0) this.db.query("insert into main.session_meta (session_id, harness, counter) values (?, ?, ?)").run(id, harness, lastTag)
    }
    if (this.targetTables.has("compartment_history_versions"))
      this.db
        .query(
          `insert into main.compartment_history_versions (session_id, version) values (?, 1)
           on conflict(session_id) do update set generation = lower(hex(randomblob(16))), version = version + 1`,
        )
        .run(id)
  }

  /** The memories the session created, merged into the target project; one already there (same text) is kept. */
  private memories(
    id: string,
    from: string,
    to: string,
    rewriter: TextRewriter | null,
    text: (value: unknown, column: string) => unknown,
  ): { copied: number; existing: number } {
    if (!this.targetTables.has("memories") || !this.sourceTables.has("memories")) return { copied: 0, existing: 0 }
    const rows = this.db
      .query("select * from src.memories where project_path = ? and source_session_id = ? and status in ('active', 'permanent') order by id")
      .all(from, id) as Row[]
    let copied = 0
    for (const row of rows) {
      const content = text(row["content"], "content") as string
      const inserted = this.insert(
        "memories",
        row,
        { project_path: to, content, normalized_hash: normalizedHash(content), superseded_by_memory_id: null },
        text,
        "or ignore",
      )
      if (inserted === 0) continue
      copied++
      // An embedding describes the text it was made from; a rewritten memory is embedded again by Magic Context.
      if (content === row["content"] && this.sourceTables.has("memory_embeddings") && this.targetTables.has("memory_embeddings"))
        this.db
          .query("insert or ignore into main.memory_embeddings (memory_id, embedding, model_id) select ?, embedding, model_id from src.memory_embeddings where memory_id = ?")
          .run(inserted, row["id"] as number)
    }
    if (copied > 0 && this.targetTables.has("project_state"))
      this.db
        .query(
          `insert into main.project_state (project_path, project_memory_epoch, project_user_profile_version, updated_at) values (?, 1, 0, ?)
           on conflict(project_path) do update set project_memory_epoch = project_memory_epoch + 1, updated_at = excluded.updated_at`,
        )
        .run(to, Date.now())
    return { copied, existing: rows.length - copied }
  }

  /** Inserts a source row into the target table, columns both have, without its `id`; returns the new row id (0: ignored). */
  private insert(table: string, row: Row, fixed: Row, text: (value: unknown, column: string) => unknown, conflict = ""): number {
    const columns = this.columnsOf(table).filter((column) => column !== "id" && (Object.hasOwn(row, column) || Object.hasOwn(fixed, column)))
    const values = columns.map((column) => (Object.hasOwn(fixed, column) ? fixed[column] : text(row[column], column)))
    const result = this.db
      .query(`insert ${conflict} into main.${table} (${columns.map((column) => `"${column}"`).join(", ")}) values (${columns.map(() => "?").join(", ")})`)
      .run(...(values as never[]))
    return result.changes === 0 ? 0 : Number(result.lastInsertRowid)
  }

  private columnsOf(table: string): readonly string[] {
    let columns = this.columns.get(table)
    if (columns === undefined) {
      columns = (this.db.query(`pragma main.table_info(${table})`).all() as { name: string }[]).map((column) => column.name)
      this.columns.set(table, columns)
    }
    return columns
  }
}

/** Magic Context's memory key: MD5 of the lower-cased text with runs of white space collapsed (`normalize-hash.ts`). */
export function normalizedHash(content: string): string {
  return createHash("md5").update(content.toLowerCase().replace(/\s+/g, " ").trim()).digest("hex")
}

function withDb<T>(path: string, readonly: boolean, work: (db: Database) => T): T {
  const db = new Database(path, readonly ? { readonly: true } : { readwrite: true })
  try {
    return work(db)
  } finally {
    db.close()
  }
}

function tablesOf(db: Database, schema: "main" | "src"): ReadonlySet<string> {
  return new Set((db.query(`select name from ${schema}.sqlite_master where type = 'table'`).all() as { name: string }[]).map((row) => row.name))
}

function reachOf(db: Database, sessionId: string, harness: Harness): number {
  const row = db.query("select max(end_message) as reach from compartments where session_id = ? and harness = ?").get(sessionId, harness) as { reach: number | null }
  return row.reach ?? 0
}

/** A wrapup marker that has not expired. Magic Context writes it as JSON with `expiresAt`; anything unreadable counts as running. */
function wrapupRunning(state: string | null, now: number): boolean {
  if (state === null || state === "") return false
  try {
    const parsed = JSON.parse(state) as { expiresAt?: unknown }
    return typeof parsed.expiresAt !== "number" || parsed.expiresAt > now
  } catch {
    return true
  }
}

function anchorsOf(db: Database, sessionId: string, harness: Harness | null): string[] {
  if (!tablesOf(db, "main").has("compartments")) return []
  const rows = db
    .query(
      `select start_message_id as a, end_message_id as b from compartments where session_id = ?${harness === null ? "" : " and harness = ?"}`,
    )
    .all(...(harness === null ? [sessionId] : [sessionId, harness])) as { a: string | null; b: string | null }[]
  return [...new Set(rows.flatMap((row) => [row.a, row.b]).filter((id): id is string => typeof id === "string" && id !== ""))]
}

/** The project recorded for the session: under its harness when given, preferring the OpenCode 2 label otherwise. */
function recordedProjectOf(db: Database, sessionId: string, harness: Harness | null): string | null {
  if (!tablesOf(db, "main").has("session_projects")) return null
  const row = db
    .query(`select project_path as p from session_projects where session_id = ? order by harness = ? desc, harness desc limit 1`)
    .get(sessionId, harness ?? "opencode2") as { p: string } | null
  return row?.p ?? null
}
