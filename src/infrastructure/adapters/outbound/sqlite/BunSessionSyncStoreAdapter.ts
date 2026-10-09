import { Database, type SQLQueryBindings } from "bun:sqlite"
import type { ProjectRecord } from "@session-manager/domain/model/Session"
import type { StoreHealth } from "@session-manager/domain/ports/outbound/MagicContextSyncStorePort"
import type {
  ProjectPlan,
  SessionCopyPlan,
  SessionCopyResult,
  SessionSyncStorePort,
  StoredSessionRow,
} from "@session-manager/domain/ports/outbound/SessionSyncStorePort"
import type { TextRewriter } from "@session-manager/domain/services/PathRewriter"

/** The session tables, keyed by `id`: OpenCode 2's and OpenCode 1's (a session may be in both). */
const SESSION_TABLES = ["session_v2", "session"] as const

/** Tables keyed by the session through `aggregate_id`: the session's event log and its sequence. */
const AGGREGATE_TABLES = ["event", "event_sequence"] as const

/** Columns that hold keys or hashes, never paths: copied unchanged. */
function isKey(column: string): boolean {
  return column === "id" || column === "key" || column === "hash" || column.endsWith("_id")
}

type Row = Record<string, SQLQueryBindings>

/**
 * Copies OpenCode sessions between stores with `bun:sqlite`. Both stores are working copies the
 * caller built with `VACUUM INTO`; the source copy is attached and only read with `select`.
 */
export class BunSessionSyncStoreAdapter implements SessionSyncStorePort {
  constructor() {}

  formatOf(dbPath: string): readonly string[] {
    return withDb(dbPath, true, (db) =>
      tablesOf(db, "main").has("migration") ? (db.query("select id from migration order by id").all() as { id: string }[]).map((row) => row.id) : [],
    )
  }

  projects(dbPath: string): readonly ProjectRecord[] {
    return withDb(dbPath, true, (db) => (tablesOf(db, "main").has("project") ? (db.query("select id, worktree from project").all() as ProjectRecord[]) : []))
  }

  hiddenRuns(dbPath: string): readonly string[] {
    return withDb(dbPath, true, (db) => {
      if (!tablesOf(db, "main").has("session_v2")) return []
      const rows = db.query("select id, metadata from session_v2 where metadata like '%hidden-run%'").all() as { id: string; metadata: string }[]
      return rows.filter((row) => isHiddenRun(row.metadata)).map((row) => row.id)
    })
  }

  storedSession(dbPath: string, sessionId: string): StoredSessionRow | null {
    return withDb(dbPath, true, (db) => {
      const tables = tablesOf(db, "main")
      const row = SESSION_TABLES.filter((table) => tables.has(table))
        .map((table) => db.query(`select project_id as projectId, directory from ${table} where id = ?`).get(sessionId) as { projectId: string; directory: string } | null)
        .find((found) => found !== null)
      const projectExists = row !== undefined && tables.has("project") && db.query("select 1 from project where id = ?").get(row!.projectId) !== null
      return row === undefined ? null : { projectId: row!.projectId, directory: row!.directory, projectExists }
    })
  }

  health(dbPath: string): StoreHealth {
    return withDb(dbPath, true, (db) => {
      const integrity = db.query("pragma integrity_check").all() as { integrity_check: string }[]
      const foreignKeys = db.query("pragma foreign_key_check").all()
      return { integrity_ok: integrity.length === 1 && integrity[0]!.integrity_check === "ok", foreign_keys_ok: foreignKeys.length === 0 }
    })
  }

  copySessions(sourceDb: string, targetDb: string, plans: readonly SessionCopyPlan[]): readonly SessionCopyResult[] {
    if (plans.length === 0) return []
    return withDb(targetDb, false, (db) => {
      db.query("attach database ? as src").run(sourceDb)
      try {
        db.exec("begin immediate")
        try {
          const results = plans.map((plan) => new FamilyCopy(db, plan).run())
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
}

/** Copies one session family inside the open transaction. */
class FamilyCopy {
  private rows = 0
  private residual = 0
  private readonly ids: readonly string[]
  private readonly shared: ReadonlySet<string>

  constructor(
    private readonly db: Database,
    private readonly plan: SessionCopyPlan,
  ) {
    this.ids = plan.sessions.map((session) => session.id)
    const target = tablesOf(db, "main")
    this.shared = new Set([...tablesOf(db, "src")].filter((table) => target.has(table)))
  }

  run(): SessionCopyResult {
    for (const project of this.plan.projects) this.ensureProject(project)
    const marks = this.ids.map(() => "?").join(", ")
    const overrides = new Map(this.plan.sessions.map((session) => [session.id, session]))

    for (const table of SESSION_TABLES.filter((name) => this.shared.has(name))) {
      this.db.query(`delete from main.${table} where id in (${marks})`).run(...this.ids)
      this.copy(table, `id in (${marks})`, this.ids, (row) => {
        const plan = overrides.get(row["id"] as string)!
        row["project_id"] = plan.projectId
        row["directory"] = plan.directory
        if ("path" in row) row["path"] = plan.path
      })
    }
    const keyed = [...this.shared].sort().filter((table) => !(SESSION_TABLES as readonly string[]).includes(table) && this.columns("main", table).includes("session_id"))
    for (const table of keyed) {
      this.db.query(`delete from main.${table} where session_id in (${marks})`).run(...this.ids)
      this.copy(table, `session_id in (${marks})`, this.ids)
    }
    const aggregates = AGGREGATE_TABLES.filter((name) => this.shared.has(name))
    for (const table of aggregates) this.db.query(`delete from main.${table} where aggregate_id in (${marks})`).run(...this.ids)
    // The sequence first: events reference it.
    for (const table of [...aggregates].reverse()) this.copy(table, `aggregate_id in (${marks})`, this.ids)
    if (this.shared.has("kv")) this.copyPluginKeys()
    if (this.shared.has("instruction_blob")) this.copyInstructionBlobs()
    return { root: this.plan.root, sessions: this.ids.length, rows: this.rows, residual_windows_paths: this.residual }
  }

  /** Plugin storage keys that name one of the sessions as a path segment (`…/<id>` or `…/<id>/…`). */
  private copyPluginKeys(): void {
    for (const id of this.ids) {
      const where = "key like 'plugin:%' and (key like ? escape '\\' or key like ? escape '\\')"
      const pattern = id.replace(/[\\%_]/g, (match) => `\\${match}`)
      const params = [`%/${pattern}`, `%/${pattern}/%`]
      this.db.query(`delete from main.kv where ${where}`).run(...params)
      this.copy("kv", where, params)
    }
  }

  /** The content-addressed blobs the copied instruction state names, unless the target has them. */
  private copyInstructionBlobs(): void {
    const marks = this.ids.map(() => "?").join(", ")
    const hashes = new Set<string>()
    for (const table of ["instruction_state", "instruction_entry"].filter((name) => this.shared.has(name))) {
      for (const row of this.db.query(`select * from main.${table} where session_id in (${marks})`).all(...this.ids) as Row[])
        for (const value of Object.values(row)) if (typeof value === "string") for (const hash of value.match(/\b[0-9a-f]{64}\b/g) ?? []) hashes.add(hash)
    }
    for (const hash of hashes) {
      const row = this.db.query("select * from src.instruction_blob where hash = ?").get(hash) as Row | null
      if (row !== null) this.insert("instruction_blob", row, "insert or ignore")
    }
  }

  private ensureProject(project: ProjectPlan): void {
    if (!this.shared.has("project") || this.db.query("select 1 from main.project where id = ?").get(project.id) !== null) return
    const template = project.templateId === null ? null : (this.db.query("select * from src.project where id = ?").get(project.templateId) as Row | null)
    const now = this.plan.now
    const row: Row = template === null ? { time_created: now, sandboxes: "[]" } : this.rewritten(template)
    this.insert("project", { ...row, id: project.id, worktree: project.worktree, vcs: project.vcs, time_updated: now })
  }

  private copy(table: string, where: string, params: readonly SQLQueryBindings[], adjust?: (row: Row) => void): void {
    for (const source of this.db.query(`select * from src.${table} where ${where}`).all(...params) as Row[]) {
      const row = this.rewritten(source)
      adjust?.(row)
      this.insert(table, row)
    }
  }

  private rewritten(source: Row): Row {
    const rewriter: TextRewriter | null = this.plan.rewriter
    const row: Row = { ...source }
    if (rewriter === null) return row
    for (const [column, value] of Object.entries(row)) {
      if (typeof value !== "string" || isKey(column)) continue
      const text = rewriter.rewrite(value)
      row[column] = text
      if (rewriter.residual(text)) this.residual++
    }
    return row
  }

  private insert(table: string, row: Row, verb = "insert"): void {
    const columns = this.columns("main", table).filter((column) => column in row)
    this.db
      .query(`${verb} into main.${table} (${columns.map((column) => `"${column}"`).join(", ")}) values (${columns.map(() => "?").join(", ")})`)
      .run(...columns.map((column) => row[column]!))
    this.rows++
  }

  private columns(schema: "main" | "src", table: string): string[] {
    return (this.db.query(`pragma ${schema}.table_info(${table})`).all() as { name: string }[]).map((row) => row.name)
  }
}

function isHiddenRun(metadata: string): boolean {
  try {
    const parsed = JSON.parse(metadata) as { magic_context?: unknown }
    return parsed.magic_context === "hidden-run"
  } catch {
    return false
  }
}

function withDb<T>(path: string, readonly: boolean, work: (db: Database) => T): T {
  const db = new Database(path, readonly ? { readonly: true } : { readwrite: true, safeIntegers: true })
  try {
    return work(db)
  } finally {
    db.close()
  }
}

function tablesOf(db: Database, schema: "main" | "src"): ReadonlySet<string> {
  return new Set((db.query(`select name from ${schema}.sqlite_master where type = 'table'`).all() as { name: string }[]).map((row) => row.name))
}
