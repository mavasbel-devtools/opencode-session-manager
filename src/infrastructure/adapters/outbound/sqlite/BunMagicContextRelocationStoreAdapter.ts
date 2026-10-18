import { and, eq, getTableColumns, getTableName, inArray, like, ne } from "drizzle-orm"
import type { SQLiteColumn, SQLiteTable } from "drizzle-orm/sqlite-core"
import type { ContextTextRewriteCounts } from "@session-manager/domain/model/Relocate"
import type { ContextLink, MagicContextRelocationStorePort } from "@session-manager/domain/ports/outbound/MagicContextRelocationStorePort"
import type { TextRewrite } from "@session-manager/domain/ports/outbound/RelocationStorePort"
import { KEYS, normalizedHash } from "@session-manager/infrastructure/adapters/outbound/sqlite/BunMagicContextSyncStoreAdapter"
import { type Orm, type Row, type Store, withStore } from "@session-manager/infrastructure/adapters/outbound/sqlite/engine/Store"
import { anyOf, minimalHints, rewriteTable, type RewriteTable } from "@session-manager/infrastructure/adapters/outbound/sqlite/TextRelocation"
import { memories, schemaMigrations, schemaMigrationsMeta, sessionMeta, sessionProjects, TABLES } from "@session-manager/infrastructure/adapters/outbound/sqlite/schema/magic-context"

/** The cached prompt snapshots of a session (Magic Context rebuilds them), cleared rather than rewritten. */
const SNAPSHOTS = ["cached_m0_bytes", "cached_m1_bytes"] as const

/** Never rewritten: Magic Context's own migration log. */
const SKIPPED: readonly SQLiteTable[] = [schemaMigrations, schemaMigrationsMeta]

/**
 * Moves sessions inside one Magic Context store through the store engine and the typed Magic
 * Context schema: each session's recorded project, and every text cell that names an old folder.
 * A memory's key (`normalized_hash`) follows its text; a memory whose new text would repeat another
 * of its project's is left as it was.
 */
export class BunMagicContextRelocationStoreAdapter implements MagicContextRelocationStorePort {
  constructor() {}

  relink(dbPath: string, links: readonly ContextLink[]): number {
    return withStore(dbPath, "write", (store) =>
      store.transaction((orm) => {
        let rows = 0
        const snapshots = SNAPSHOTS.filter((column) => store.columns(getTableName(sessionMeta)).includes(column))
        for (const link of links) {
          if (store.has(sessionProjects, ["session_id", "project_path"]))
            rows += Number(
              (orm.update(sessionProjects).set({ project_path: link.project }).where(and(eq(sessionProjects.session_id, link.sessionId), ne(sessionProjects.project_path, link.project))).run() as unknown as { changes: number | bigint }).changes,
            )
          if (snapshots.length > 0)
            orm
              .update(sessionMeta)
              .set(Object.fromEntries(snapshots.map((column) => [column, null])))
              .where(eq(sessionMeta.session_id, link.sessionId))
              .run()
        }
        return rows
      }),
    )
  }

  rewriteText(dbPath: string, rewrite: TextRewrite): ContextTextRewriteCounts {
    return withStore(dbPath, "write", (store) =>
      store.transaction((orm) => {
        const rows: Record<string, number> = {}
        const residual: Record<string, number> = {}
        let conflicts = 0
        let cleared = 0
        const ids = rewrite.scope === "all" ? null : rewrite.scope.sessions
        for (const table of Object.values(TABLES) as SQLiteTable[]) {
          if (!store.has(table) || SKIPPED.includes(table)) continue
          const columns = getTableColumns(table) as Record<string, SQLiteColumn>
          if (ids !== null && !("session_id" in columns)) continue
          const target: RewriteTable = {
            table,
            keys: KEYS,
            ...(ids === null ? {} : { where: inArray(columns["session_id"]!, [...ids]) }),
            ...(table === memories ? { adjust: (_before: Row, set: Row, key: Row) => this.memory(store, orm, set, key) } : {}),
            ...(table === sessionMeta
              ? {
                  adjust: (_before: Row, set: Row) => {
                    const snapshot = Object.keys(set).filter((column) => (SNAPSHOTS as readonly string[]).includes(column))
                    cleared += snapshot.length
                    return { ...set, ...Object.fromEntries(snapshot.map((column) => [column, null])) }
                  },
                }
              : {}),
          }
          const result = rewriteTable(store, orm, target, rewrite)
          const name = getTableName(table)
          if (result.rows > 0) rows[name] = result.rows
          if (result.residual > 0) residual[name] = result.residual
          conflicts += result.declined
        }
        cleared += this.clearSnapshots(store, orm, rewrite, ids)
        return { rows, residual, kept: {}, memory_conflicts: conflicts, snapshots_cleared: cleared }
      }),
    )
  }

  /**
   * Cached prompt snapshots stored as bytes (which no text rewrite reads) that name an old folder or
   * a renamed name: cleared, Magic Context rebuilds them. Returns the cells cleared.
   */
  private clearSnapshots(store: Store, orm: Orm, rewrite: TextRewrite, ids: readonly string[] | null): number {
    const needles = minimalHints([...rewrite.hints, ...(rewrite.names?.needles ?? [])])
    if (!store.has(sessionMeta, ["session_id"]) || needles.length === 0) return 0
    let cleared = 0
    for (const column of SNAPSHOTS.filter((name) => store.columns(getTableName(sessionMeta)).includes(name))) {
      const cell = sessionMeta[column]
      const naming = anyOf(needles.map((needle) => like(cell, `%${needle}%`)))
      const scope = ids === null ? naming : and(naming, inArray(sessionMeta.session_id, [...ids]))
      cleared += Number((orm.update(sessionMeta).set({ [column]: null }).where(scope).run() as unknown as { changes: number | bigint }).changes)
    }
    return cleared
  }

  /** A memory's new text with its new key, or null when another memory of its project already has that key. */
  private memory(store: Store, orm: Orm, set: Row, key: Row): Row | null {
    if (set["content"] === undefined) return set
    const hash = normalizedHash(String(set["content"]))
    const row = orm
      .select(store.pick(memories, ["project_path", "category"]))
      .from(memories)
      .where(eq(memories.id, key["id"] as bigint))
      .get() as { project_path: string; category: string }
    const repeat = orm
      .select({ id: memories.id })
      .from(memories)
      .where(and(eq(memories.project_path, row.project_path), eq(memories.category, row.category), eq(memories.normalized_hash, hash), ne(memories.id, key["id"] as bigint)))
      .get()
    return repeat === undefined ? { ...set, normalized_hash: hash } : null
  }
}
