import { asc, eq, getTableColumns, getTableName, inArray, like, or, type SQL } from "drizzle-orm"
import type { SQLiteColumn, SQLiteTable } from "drizzle-orm/sqlite-core"
import { UnknownStoreSchemaError } from "@session-manager/domain/errors/UnknownStoreSchemaError"
import type { ProjectRecord } from "@session-manager/domain/model/Session"
import type { StoreHealth } from "@session-manager/domain/ports/outbound/MagicContextSyncStorePort"
import type {
  ProjectPlan,
  SessionCopyPlan,
  SessionCopyResult,
  SessionSyncStorePort,
  StoredSessionRow,
} from "@session-manager/domain/ports/outbound/SessionSyncStorePort"
import { type Orm, type Row, openStore, type Store, withStore } from "@session-manager/infrastructure/adapters/outbound/sqlite/engine/Store"
import {
  event,
  eventSequence,
  instructionBlob,
  instructionEntry,
  instructionState,
  kv,
  migration,
  project,
  session,
  sessionV2,
  TABLES,
} from "@session-manager/infrastructure/adapters/outbound/sqlite/schema/opencode"
import type { TextRewriter } from "@session-manager/domain/services/PathRewriter"

type Keyed = SQLiteTable & { session_id: SQLiteColumn }

/** The session tables, keyed by `id`: OpenCode 2's and OpenCode 1's (a session may be in both). */
const SESSION_TABLES = [sessionV2, session] as const

/** Every other table keyed by the session (`session_id`), in name order (a message before its parts). */
const KEYED: readonly Keyed[] = Object.values(TABLES)
  .filter((table) => "session_id" in getTableColumns(table) && !(SESSION_TABLES as readonly SQLiteTable[]).includes(table))
  .sort((a, b) => getTableName(a).localeCompare(getTableName(b))) as unknown as Keyed[]

/** Every table a session copy reads or writes. */
const COPIED: readonly SQLiteTable[] = [...SESSION_TABLES, ...KEYED, eventSequence, event, kv, instructionBlob, project]

/** Columns that hold keys or hashes, never paths: copied unchanged. */
function isKey(column: string): boolean {
  return column === "id" || column === "key" || column === "hash" || column.endsWith("_id")
}

/** A storage key that names the session as a whole path segment (`…/<id>` or `…/<id>/…`). */
function namesSession(key: string, id: string): boolean {
  return key.endsWith(`/${id}`) || key.includes(`/${id}/`)
}

const HASH = /\b[0-9a-f]{64}\b/g

/**
 * Copies OpenCode sessions between stores through the store engine and the typed OpenCode schema.
 * Both stores are working copies the caller built with `VACUUM INTO`; the source is only read.
 * A store whose tables hold a column the schema does not know, or another table keyed by the
 * session, is refused: copying through the schema would silently leave that data behind.
 */
export class BunSessionSyncStoreAdapter implements SessionSyncStorePort {
  constructor() {}

  formatOf(dbPath: string): readonly string[] {
    return withStore(dbPath, "read", (store) =>
      store.has(migration, ["id"])
        ? store.orm.select({ id: migration.id }).from(migration).orderBy(asc(migration.id)).all().map((row) => String(row.id))
        : [],
    )
  }

  projects(dbPath: string): readonly ProjectRecord[] {
    return withStore(dbPath, "read", (store) =>
      store.has(project, ["id", "worktree"])
        ? store.orm.select({ id: project.id, worktree: project.worktree }).from(project).all().map((row) => ({ id: String(row.id), worktree: String(row.worktree) }))
        : [],
    )
  }

  hiddenRuns(dbPath: string): readonly string[] {
    return withStore(dbPath, "read", (store) => {
      if (!store.has(sessionV2, ["id", "metadata"])) return []
      const rows = store.orm.select({ id: sessionV2.id, metadata: sessionV2.metadata }).from(sessionV2).where(like(sessionV2.metadata, "%hidden-run%")).all()
      return rows.filter((row) => isHiddenRun(String(row.metadata))).map((row) => String(row.id))
    })
  }

  storedSession(dbPath: string, sessionId: string): StoredSessionRow | null {
    return withStore(dbPath, "read", (store) => {
      for (const table of SESSION_TABLES.filter((candidate) => store.has(candidate, ["id", "project_id", "directory"]))) {
        const row = store.orm.select({ projectId: table.project_id, directory: table.directory }).from(table).where(eq(table.id, sessionId)).get()
        if (row === undefined) continue
        const projectExists = store.has(project, ["id"]) && store.orm.select({ id: project.id }).from(project).where(eq(project.id, String(row.projectId))).get() !== undefined
        return { projectId: String(row.projectId), directory: String(row.directory), projectExists }
      }
      return null
    })
  }

  health(dbPath: string): StoreHealth {
    return withStore(dbPath, "read", (store) => {
      const integrity = store.integrity()
      return { integrity_ok: integrity.length === 1 && integrity[0] === "ok", foreign_keys_ok: store.foreignKeyViolations() === 0 }
    })
  }

  copySessions(sourceDb: string, targetDb: string, plans: readonly SessionCopyPlan[]): readonly SessionCopyResult[] {
    if (plans.length === 0) return []
    const source = openStore(sourceDb, "read")
    try {
      return withStore(targetDb, "write", (target) => {
        assertKnown(source)
        assertKnown(target)
        return target.transaction((orm) => plans.map((plan) => new FamilyCopy(source, target, orm, plan).run()))
      })
    } finally {
      source.close()
    }
  }
}

/** Refuses a store holding data the OpenCode schema does not describe. */
function assertKnown(store: Store): void {
  const unknown: string[] = []
  for (const table of COPIED) {
    if (!store.has(table)) continue
    const known = new Set(Object.keys(getTableColumns(table)))
    for (const column of store.columns(getTableName(table))) if (!known.has(column)) unknown.push(`${getTableName(table)}.${column}`)
  }
  const tables = new Set(Object.keys(TABLES))
  for (const name of store.ordinaryTables()) if (!tables.has(name) && store.columns(name).includes("session_id")) unknown.push(name)
  if (unknown.length > 0) throw new UnknownStoreSchemaError(store.path, unknown)
}

function isHiddenRun(metadata: string): boolean {
  try {
    const parsed = JSON.parse(metadata) as { magic_context?: unknown }
    return parsed.magic_context === "hidden-run"
  } catch {
    return false
  }
}

/** Copies one session family inside the target's open transaction. */
class FamilyCopy {
  private rows = 0
  private residual = 0
  private readonly ids: string[]

  constructor(
    private readonly source: Store,
    private readonly target: Store,
    private readonly orm: Orm,
    private readonly plan: SessionCopyPlan,
  ) {
    this.ids = plan.sessions.map((entry) => entry.id)
  }

  run(): SessionCopyResult {
    for (const planned of this.plan.projects) this.ensureProject(planned)
    const overrides = new Map(this.plan.sessions.map((entry) => [entry.id, entry]))
    const both = (table: SQLiteTable) => this.source.has(table) && this.target.has(table)

    for (const table of SESSION_TABLES.filter(both)) {
      this.orm.delete(table).where(inArray(table.id, this.ids)).run()
      for (const row of this.read(table, inArray(table.id, this.ids))) {
        const planned = overrides.get(String(row["id"]))!
        this.write(table, { ...this.rewritten(row), project_id: planned.projectId, directory: planned.directory, path: planned.path })
      }
    }
    for (const table of KEYED.filter(both)) {
      this.orm.delete(table).where(inArray(table.session_id, this.ids)).run()
      for (const row of this.read(table, inArray(table.session_id, this.ids))) this.write(table, this.rewritten(row))
    }
    if (both(eventSequence) && both(event)) {
      this.orm.delete(event).where(inArray(event.aggregate_id, this.ids)).run()
      this.orm.delete(eventSequence).where(inArray(eventSequence.aggregate_id, this.ids)).run()
      // The sequence first: events reference it.
      for (const table of [eventSequence, event]) for (const row of this.read(table, inArray(table.aggregate_id, this.ids))) this.write(table, this.rewritten(row))
    }
    if (both(kv)) this.copyPluginKeys()
    if (both(instructionBlob)) this.copyInstructionBlobs()
    return { root: this.plan.root, sessions: this.ids.length, rows: this.rows, residual_windows_paths: this.residual }
  }

  /** Plugin storage keys that name one of the sessions as a path segment. */
  private copyPluginKeys(): void {
    const candidates = or(...this.ids.map((id) => like(kv.key, `plugin:%${id}%`)))!
    const wanted = (rows: readonly Row[]) => rows.filter((row) => this.ids.some((id) => namesSession(String(row["key"]), id)))
    const stale = wanted(this.target.orm.select({ key: kv.key }).from(kv).where(candidates).all())
    if (stale.length > 0) this.orm.delete(kv).where(inArray(kv.key, stale.map((row) => String(row["key"])))).run()
    for (const row of wanted(this.read(kv, candidates))) this.write(kv, this.rewritten(row))
  }

  /** The content-addressed blobs the copied instruction state names, unless the target has them. */
  private copyInstructionBlobs(): void {
    const hashes = new Set<string>()
    for (const table of [instructionState, instructionEntry].filter((candidate) => this.target.has(candidate)))
      for (const row of this.orm.select(this.target.selection(table)).from(table).where(inArray(table.session_id, this.ids)).all() as Row[])
        for (const cell of Object.values(row)) if (typeof cell === "string") for (const hash of cell.match(HASH) ?? []) hashes.add(hash)
    if (hashes.size === 0) return
    for (const row of this.read(instructionBlob, inArray(instructionBlob.hash, [...hashes]))) this.write(instructionBlob, row, true)
  }

  private ensureProject(planned: ProjectPlan): void {
    if (!this.target.has(project) || this.orm.select({ id: project.id }).from(project).where(eq(project.id, planned.id)).get() !== undefined) return
    const template = planned.templateId === null ? undefined : this.read(project, eq(project.id, planned.templateId))[0]
    const now = BigInt(this.plan.now)
    const row: Row = template === undefined ? { time_created: now, sandboxes: "[]" } : this.rewritten(template)
    this.write(project, { ...row, id: planned.id, worktree: planned.worktree, vcs: planned.vcs, time_updated: now })
  }

  private read(table: SQLiteTable, where: SQL | undefined): Row[] {
    return this.source.orm.select(this.source.selection(table)).from(table).where(where).all() as Row[]
  }

  private write(table: SQLiteTable, row: Row, ignoreConflict = false): void {
    this.target.insert(this.orm, table, row, ignoreConflict ? { ignore: true } : undefined)
    this.rows++
  }

  private rewritten(source: Row): Row {
    const rewriter: TextRewriter | null = this.plan.rewriter
    if (rewriter === null) return { ...source }
    const row: Row = {}
    for (const [column, cell] of Object.entries(source)) {
      if (typeof cell !== "string" || isKey(column)) {
        row[column] = cell
        continue
      }
      const text = rewriter.rewrite(cell)
      row[column] = text
      if (rewriter.residual(text)) this.residual++
    }
    return row
  }
}
