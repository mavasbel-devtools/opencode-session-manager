import { and, count, eq, getTableName, like, or, type SQL } from "drizzle-orm"
import type { SQLiteColumn, SQLiteTable } from "drizzle-orm/sqlite-core"
import type { TextRewrite } from "@session-manager/domain/ports/outbound/RelocationStorePort"
import type { Orm, Row, Store } from "@session-manager/infrastructure/adapters/outbound/sqlite/engine/Store"

/** One table a text rewrite visits, and the rows of it in scope. */
export interface RewriteTable {
  readonly table: SQLiteTable
  /** Narrows the rows (a session scope); undefined: every row. */
  readonly where?: SQL
  /** Columns never rewritten in this table (keys, and values another step owns). */
  readonly keys: ReadonlySet<string>
  /** Keeps a matching row only when this holds for its primary key (e.g. a storage key naming a session). */
  readonly keep?: (key: Row) => boolean
  /**
   * The cells to write for a row whose text changed (`set` holds the rewritten cells; `before` the
   * row's text columns as stored): the same, adjusted, or null to leave the row as it is.
   */
  readonly adjust?: (before: Row, set: Row, key: Row) => Row | null
}

export interface TableRewrite {
  readonly rows: number
  readonly residual: number
  /** Rows a table's `adjust` left as they were. */
  readonly declined: number
}

/** The condition "some text column holds some hint" over a table's columns that the store has. */
function mentions(store: Store, table: SQLiteTable, columns: readonly string[], hints: readonly string[]): SQL | undefined {
  const selection = store.selection(table)
  const conditions = columns.flatMap((name) => hints.map((hint) => like(selection[name] as SQLiteColumn, `%${hint}%`)))
  return conditions.length === 0 ? undefined : or(...conditions)
}

/** A hint as a whole folder name: `…/relational-dbs` is not found in `…/relational-dbs-2025` (the rewriter's own boundary). */
function hintPatterns(hints: readonly string[]): RegExp[] {
  return hints.map((hint) => new RegExp(`${hint.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}(?![\\w-]|\\.[\\w-])`))
}

function holdsHint(row: Row, patterns: readonly RegExp[]): boolean {
  return Object.values(row).some((cell) => typeof cell === "string" && patterns.some((pattern) => pattern.test(cell)))
}

/**
 * Rewrites, in place, every text cell of a table's rows in scope that holds a hint, through the
 * store's primary key (a table without one is left alone). Rows are found by key first and read
 * one at a time, so a store with large rows is never held in memory at once.
 */
export function rewriteTable(store: Store, orm: Orm, target: RewriteTable, rewrite: TextRewrite): TableRewrite {
  const name = getTableName(target.table)
  const key = store.primaryKey(name)
  const columns = Object.keys(store.selection(target.table)).filter((column) => !key.includes(column) && !target.keys.has(column))
  const matching = mentions(store, target.table, columns, rewrite.hints)
  if (key.length === 0 || matching === undefined) return { rows: 0, residual: 0, declined: 0 }
  const selection = store.selection(target.table)
  const keySelection = Object.fromEntries(key.map((column) => [column, selection[column]!]))
  const textSelection = Object.fromEntries(columns.map((column) => [column, selection[column]!]))
  const keys = (orm.select(keySelection).from(target.table).where(and(matching, target.where)).all() as Row[]).filter((row) => target.keep?.(row) ?? true)
  const patterns = hintPatterns(rewrite.hints)
  let rows = 0
  let residual = 0
  let declined = 0
  for (const rowKey of keys) {
    const before = orm
      .select(textSelection)
      .from(target.table)
      .where(and(...key.map((column) => eq(selection[column]!, rowKey[column]))))
      .get() as Row
    const set: Row = {}
    for (const [column, cell] of Object.entries(before)) {
      if (typeof cell !== "string") continue
      const text = rewrite.rewriter.rewrite(cell)
      if (text !== cell) set[column] = text
    }
    const after = { ...before, ...set }
    if (Object.keys(set).length > 0) {
      const adjusted = target.adjust === undefined ? set : target.adjust(before, set, rowKey)
      if (adjusted === null) {
        declined++
        continue
      }
      store.update(orm, target.table, rowKey, adjusted)
      rows++
      if (holdsHint({ ...before, ...adjusted }, patterns)) residual++
    } else if (holdsHint(after, patterns)) residual++
  }
  return { rows, residual, declined }
}

/** How many rows of a table mention a hint in any column (for tables a rewrite keeps as they are). */
export function countMentions(store: Store, orm: Orm, table: SQLiteTable, hints: readonly string[]): number {
  const columns = Object.keys(store.selection(table))
  const matching = mentions(store, table, columns, hints)
  if (matching === undefined) return 0
  const rows = orm.select({ rows: count() }).from(table).where(matching).all() as { rows: number }[]
  return Number(rows[0]?.rows ?? 0)
}
