import { and, eq, getTableColumns, getTableName, inArray, like, or } from "drizzle-orm"
import type { SQLiteColumn, SQLiteTable } from "drizzle-orm/sqlite-core"
import type { TextRewriteCounts } from "@session-manager/domain/model/Relocate"
import type { RelocationStorePort, SessionMove, TextRewrite } from "@session-manager/domain/ports/outbound/RelocationStorePort"
import type { ProjectPlan } from "@session-manager/domain/ports/outbound/SessionSyncStorePort"
import { type Orm, type Row, type Store, withStore } from "@session-manager/infrastructure/adapters/outbound/sqlite/engine/Store"
import { rewriteInstructionBlobs } from "@session-manager/infrastructure/adapters/outbound/sqlite/InstructionBlobs"
import { countMentions, rewriteTable, type RewriteTable } from "@session-manager/infrastructure/adapters/outbound/sqlite/TextRelocation"
import { event, instructionBlob, kv, migration, project, projectDirectory, session, sessionV2, TABLES, worktree } from "@session-manager/infrastructure/adapters/outbound/sqlite/schema/opencode"

/** The session tables (OpenCode 2's and OpenCode 1's), whose folder and project a move sets. */
const SESSION_TABLES = [sessionV2, session] as const

/** The projects' records: kept as they are (they describe the old projects), but for renamed names. */
const PROJECT_RECORDS: readonly SQLiteTable[] = [project, projectDirectory, worktree]

/** Projects' records keyed by a folder: a renamed folder changes the key itself. */
const FOLDER_KEYED = [projectDirectory, worktree] as const

/** Kept as they are: the old projects' records. */
const KEPT: readonly SQLiteTable[] = PROJECT_RECORDS

/** Never rewritten anywhere: OpenCode's own migration log. */
const SKIPPED: readonly SQLiteTable[] = [migration]

/** Columns that hold keys or hashes, never paths. */
function isKey(column: string): boolean {
  return column === "id" || column === "key" || column === "hash" || column.endsWith("_id")
}

/** A storage key that names one of the sessions as a whole path segment (`…/<id>` or `…/<id>/…`). */
function namesSession(key: string, ids: readonly string[]): boolean {
  return ids.some((id) => key.endsWith(`/${id}`) || key.includes(`/${id}/`))
}

/**
 * Moves sessions inside one OpenCode store through the store engine and the typed OpenCode
 * schema: a session row's folder, project and `path`, and every text cell that names an old folder.
 */
export class BunRelocationStoreAdapter implements RelocationStorePort {
  constructor() {}

  moveSessions(dbPath: string, moves: readonly SessionMove[], projects: readonly ProjectPlan[], now: number): number {
    return withStore(dbPath, "write", (store) =>
      store.transaction((orm) => {
        if (store.has(project))
          for (const planned of projects) {
            if (orm.select({ id: project.id }).from(project).where(eq(project.id, planned.id)).get() !== undefined) continue
            const template = planned.templateId === null ? undefined : (orm.select(store.selection(project)).from(project).where(eq(project.id, planned.templateId)).get() as Row | undefined)
            const row: Row = template === undefined ? { time_created: BigInt(now), sandboxes: "[]" } : { ...template }
            store.insert(orm, project, { ...row, id: planned.id, worktree: planned.worktree, vcs: planned.vcs, time_updated: BigInt(now) })
          }
        let rows = 0
        for (const table of SESSION_TABLES.filter((candidate) => store.has(candidate, ["id", "directory", "project_id"])))
          for (const move of moves) {
            const set: Row = { directory: move.directory, project_id: move.projectId }
            if (store.columns(getTableName(table)).includes("path")) set["path"] = move.path
            rows += store.update(orm, table, { id: move.id }, set)
          }
        return rows
      }),
    )
  }

  rewriteText(dbPath: string, rewrite: TextRewrite): TextRewriteCounts {
    return withStore(dbPath, "write", (store) =>
      store.transaction((orm) => {
        const counts = { rows: {} as Record<string, number>, residual: {} as Record<string, number>, kept: {} as Record<string, number> }
        const ids = rewrite.scope === "all" ? null : rewrite.scope.sessions
        for (const table of Object.values(TABLES) as SQLiteTable[]) {
          const name = getTableName(table)
          if (!store.has(table) || SKIPPED.includes(table)) continue
          if (table === instructionBlob) {
            const blobs = rewriteInstructionBlobs(store, orm, rewrite, ids)
            if (blobs.rows > 0) counts.rows[name] = blobs.rows
            if (blobs.residual > 0) counts.residual[name] = blobs.residual
            continue
          }
          if (ids === null && rewrite.names !== null && PROJECT_RECORDS.includes(table)) {
            const names: TextRewrite = { rewriter: rewrite.names.rewriter, hints: [], names: rewrite.names, scope: "all" }
            const result = rewriteTable(store, orm, { table, keys: new Set(Object.keys(getTableColumns(table)).filter(isKey)) }, names)
            const rekeyed = this.rekey(store, orm, table, rewrite.names)
            if (result.rows + rekeyed > 0) counts.rows[name] = result.rows + rekeyed
            if (result.residual > 0) counts.residual[name] = result.residual
            const mentioned = countMentions(store, orm, table, rewrite)
            if (mentioned > 0) counts.kept[name] = mentioned
            continue
          }
          if (KEPT.includes(table)) {
            if (ids === null) {
              const mentioned = countMentions(store, orm, table, rewrite)
              if (mentioned > 0) counts.kept[name] = mentioned
            }
            continue
          }
          const target = this.scoped(table, ids)
          if (target === null) continue
          const result = rewriteTable(store, orm, target, rewrite)
          if (result.rows > 0) counts.rows[name] = result.rows
          if (result.residual > 0) counts.residual[name] = result.residual
        }
        return counts
      }),
    )
  }

  /**
   * A record keyed by a renamed folder takes the folder's new name; when its project already has a
   * record for the new folder, the old one is removed (the project is the same, so is the record).
   */
  private rekey(store: Store, orm: Orm, table: SQLiteTable, names: NonNullable<TextRewrite["names"]>): number {
    // Both tables have the same two key columns; typed as one of them.
    const keyed = FOLDER_KEYED.find((candidate) => candidate === table) as typeof worktree | undefined
    if (keyed === undefined || !store.has(keyed, ["project_id", "directory"])) return 0
    const rows = orm
      .select({ project_id: keyed.project_id, directory: keyed.directory })
      .from(keyed)
      .where(or(...names.needles.map((needle) => like(keyed.directory, `%${needle}%`))))
      .all()
    let changed = 0
    for (const row of rows as { project_id: string; directory: string }[]) {
      const directory = names.rewriter.rewrite(row.directory)
      if (directory === row.directory) continue
      const existing = orm.select({ directory: keyed.directory }).from(keyed).where(and(eq(keyed.project_id, row.project_id), eq(keyed.directory, directory))).get()
      if (existing === undefined) store.update(orm, keyed, { project_id: row.project_id, directory: row.directory }, { directory })
      else orm.delete(keyed).where(and(eq(keyed.project_id, row.project_id), eq(keyed.directory, row.directory))).run()
      changed++
    }
    return changed
  }

  /** The table's rows in scope: a session scope keeps rows keyed by the sessions, and drops tables that are not. */
  private scoped(table: SQLiteTable, ids: readonly string[] | null): RewriteTable | null {
    const columns = getTableColumns(table) as Record<string, SQLiteColumn>
    const isSessionTable = (SESSION_TABLES as readonly SQLiteTable[]).includes(table)
    // A session row's folder is set by the move, never by the text rewrite.
    const keys = new Set([...Object.keys(columns).filter(isKey), ...(isSessionTable ? ["directory"] : [])])
    if (ids === null) return { table, keys }
    if (isSessionTable) return { table, keys, where: inArray(columns["id"]!, [...ids]) }
    if (table === event) return { table, keys, where: inArray(columns["aggregate_id"]!, [...ids]) }
    if (table === kv) return { table, keys, keep: (key) => namesSession(String(key["key"]), ids) }
    if ("session_id" in columns) return { table, keys, where: inArray(columns["session_id"]!, [...ids]) }
    return null
  }
}
