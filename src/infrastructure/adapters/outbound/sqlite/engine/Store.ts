import { Database } from "bun:sqlite"
import { getTableColumns, getTableName, sql } from "drizzle-orm"
import { drizzle, type BunSQLiteDatabase } from "drizzle-orm/bun-sqlite"
import { sqliteTable, type SQLiteColumn, type SQLiteTable } from "drizzle-orm/sqlite-core"
import { value } from "@session-manager/infrastructure/adapters/outbound/sqlite/schema/value"

/** The typed query builder over one open store (the `drizzle-orm` API; no SQL text). */
export type Orm = BunSQLiteDatabase

/** A store row, keyed by column name, values exactly as stored (integers as BigInt). */
export type Row = Record<string, unknown>

export interface SchemaEntry {
  readonly type: string
  readonly name: string
  readonly tbl_name: string
  readonly sql: string | null
}

/** What a write did: rows changed, and the row id of the last insert. */
export interface WriteResult {
  readonly changes: number
  readonly lastInsertRowid: bigint
}

/** On a key conflict: skip the row, or update the named columns of the row already there. */
export type Conflict = { readonly ignore: true } | { readonly target: readonly string[]; readonly set: readonly string[] }

/** The page statistics SQLite reports for a store. */
export interface PragmaNumbers {
  readonly page_size: number
  readonly page_count: number
  readonly freelist_count: number
  readonly auto_vacuum: number
  readonly user_version: number
  readonly application_id: number
}

const PRAGMAS = ["page_size", "page_count", "freelist_count", "auto_vacuum", "user_version", "application_id"] as const

function quoted(name: string): string {
  return `"${name.replaceAll('"', '""')}"`
}

/**
 * One open SQLite store: the only place in `src` that touches `bun:sqlite` or writes SQL text.
 * Everything that can be said with the query builder is said through `orm`; what no query builder
 * expresses — PRAGMAs, `VACUUM INTO`, the schema in `sqlite_master`, and reading a table only
 * known at run time — is a method here.
 */
export interface Store {
  readonly orm: Orm
  readonly path: string
  close(): void
  /** Every table the store has (ordinary and virtual), by name. */
  tables(): ReadonlySet<string>
  /** The store's own tables: not virtual tables, nor the shadow tables a virtual table keeps. */
  ordinaryTables(): readonly string[]
  /** The columns a table has in this store (empty when it has no such table). */
  columns(table: string): readonly string[]
  /** Whether the store has the table and, when named, every one of those columns. */
  has(table: SQLiteTable, columns?: readonly string[]): boolean
  /** The columns of a schema table this store has, as a selection (an older store lacks some). */
  selection(table: SQLiteTable): Record<string, SQLiteColumn>
  /** The named columns of a schema table, as a selection, refusing when the store lacks one. */
  pick<T extends SQLiteTable, K extends keyof T["_"]["columns"] & string>(table: T, names: readonly K[]): { [P in K]: T["_"]["columns"][P] }
  /** A row reduced to the columns the store's table has. */
  fit(table: SQLiteTable, row: Row): Row
  /** Inserts one row with exactly the columns it carries that the store's table has. */
  insert(orm: Orm, table: SQLiteTable, row: Row, conflict?: Conflict): WriteResult
  /** Runs `work` in one `BEGIN IMMEDIATE` transaction, rolled back when it throws. */
  transaction<T>(work: (orm: Orm) => T): T
  /** `pragma integrity_check`: `["ok"]` when the store is sound. */
  integrity(): readonly string[]
  /** How many rows `pragma foreign_key_check` reports. */
  foreignKeyViolations(): number
  pragmas(): PragmaNumbers
  /** Every entry of `sqlite_master`, by type then name. */
  schema(): readonly SchemaEntry[]
  /** Every row of a table known only at run time, ordered by its primary key (else every column). */
  rowsOf(table: string): IterableIterator<Row>
  /** `VACUUM INTO`: a compact copy at `target`; the store itself is not written. */
  vacuumInto(target: string): void
  /** Switches the store to WAL journaling. */
  setWal(): void
}

/**
 * The `bun:sqlite` store.
 *
 * Integers are read as BigInt (`safeIntegers`), so a copied row is byte-for-byte what was stored.
 * Statements are built with `query()` (cached and finalized by `close()`), never `prepare()`, so
 * closing the store releases the file: drizzle-orm prepares every statement through the client's
 * `prepare`, which is pointed at `query` here.
 */
class SqliteStore implements Store {
  readonly orm: Orm
  readonly path: string
  private readonly db: Database
  private tableNames: ReadonlySet<string> | null = null
  private readonly columnNames = new Map<string, readonly string[]>()
  private readonly narrowed = new Map<string, SQLiteTable & Record<string, SQLiteColumn>>()

  constructor(path: string, mode: "read" | "write") {
    this.path = path
    this.db = new Database(path, mode === "read" ? { readonly: true, safeIntegers: true } : { readwrite: true, safeIntegers: true })
    this.db.prepare = ((text: string) => this.db.query(text)) as Database["prepare"]
    this.orm = drizzle({ client: this.db })
  }

  close(): void {
    this.db.close()
  }

  /** Every table the store has (ordinary and virtual), by name. */
  tables(): ReadonlySet<string> {
    this.tableNames ??= new Set(
      (this.db.query("select name from sqlite_master where type = 'table'").all() as { name: string }[]).map((row) => row.name),
    )
    return this.tableNames
  }

  /** The store's own tables: not virtual tables, nor the shadow tables a virtual table keeps. */
  ordinaryTables(): readonly string[] {
    const schema = this.schema().filter((entry) => entry.type === "table" && !entry.name.startsWith("sqlite_"))
    const virtual = schema.filter((entry) => /^create virtual table/i.test(entry.sql ?? "")).map((entry) => entry.name)
    return schema.map((entry) => entry.name).filter((name) => !virtual.includes(name) && !virtual.some((table) => name.startsWith(`${table}_`)))
  }

  /** The columns a table has in this store (empty when it has no such table). */
  columns(table: string): readonly string[] {
    let names = this.columnNames.get(table)
    if (names === undefined) {
      names = this.tables().has(table) ? (this.db.query(`pragma table_info(${quoted(table)})`).all() as { name: string }[]).map((row) => row.name) : []
      this.columnNames.set(table, names)
    }
    return names
  }

  /** Whether the store has the table and, when named, every one of those columns. */
  has(table: SQLiteTable, columns: readonly string[] = []): boolean {
    if (!this.tables().has(getTableName(table))) return false
    const present = new Set(this.columns(getTableName(table)))
    return columns.every((column) => present.has(column))
  }

  /**
   * The columns of a schema table this store has, as a selection for `orm.select(…)`: a store of an
   * older format lacks some, and a select of all of them would fail.
   */
  selection(table: SQLiteTable): Record<string, SQLiteColumn> {
    const present = new Set(this.columns(getTableName(table)))
    return Object.fromEntries(Object.entries(getTableColumns(table)).filter(([name]) => present.has(name)))
  }

  /**
   * The named columns of a schema table, as a selection, refusing when the store lacks one. SQLite
   * reads an unknown double-quoted column name as a string literal, so a select naming a column the
   * store does not have would return the column's name as its value instead of failing.
   */
  pick<T extends SQLiteTable, K extends keyof T["_"]["columns"] & string>(table: T, names: readonly K[]): { [P in K]: T["_"]["columns"][P] } {
    const present = new Set(this.columns(getTableName(table)))
    const missing = names.filter((name) => !present.has(name))
    if (missing.length > 0) throw new Error(`${getTableName(table)} has no column ${missing.join(", ")} in ${this.path}`)
    const columns = getTableColumns(table)
    return Object.fromEntries(names.map((name) => [name, columns[name]])) as { [P in K]: T["_"]["columns"][P] }
  }

  /** A row reduced to the columns the store's table has. */
  fit(table: SQLiteTable, row: Row): Row {
    const present = new Set(this.columns(getTableName(table)))
    return Object.fromEntries(Object.entries(row).filter(([name, cell]) => present.has(name) && cell !== undefined))
  }

  /**
   * Inserts one row with exactly the columns it carries that the store's table has, so SQLite
   * applies its own defaults to the rest (drizzle-orm would write NULL into every column a row
   * leaves out, and name columns an older store does not have).
   */
  insert(orm: Orm, table: SQLiteTable, row: Row, conflict?: Conflict): WriteResult {
    const cells = this.fit(table, row)
    const narrow = this.narrow(getTableName(table), [...new Set([...Object.keys(cells), ...(conflict !== undefined && "target" in conflict ? conflict.target : [])])])
    const statement = orm.insert(narrow).values(cells)
    const result =
      conflict === undefined
        ? statement.run()
        : "ignore" in conflict
          ? statement.onConflictDoNothing().run()
          : statement
              .onConflictDoUpdate({
                target: conflict.target.map((name) => narrow[name as keyof typeof narrow] as SQLiteColumn),
                set: Object.fromEntries(conflict.set.map((name) => [name, cells[name]])),
              })
              .run()
    const written = result as unknown as { changes: number | bigint; lastInsertRowid: number | bigint }
    return { changes: Number(written.changes), lastInsertRowid: BigInt(written.lastInsertRowid) }
  }

  /** A table of only the named columns, each passing its values through untouched. */
  private narrow(name: string, columns: readonly string[]): SQLiteTable & Record<string, SQLiteColumn> {
    const key = `${name}\u0000${columns.join("\u0000")}`
    let table = this.narrowed.get(key)
    if (table === undefined) {
      table = sqliteTable(name, Object.fromEntries(columns.map((column) => [column, value(column)]))) as unknown as SQLiteTable & Record<string, SQLiteColumn>
      this.narrowed.set(key, table)
    }
    return table
  }

  /** Runs `work` in one `BEGIN IMMEDIATE` transaction, rolled back when it throws. */
  transaction<T>(work: (orm: Orm) => T): T {
    return this.orm.transaction((tx) => work(tx as unknown as Orm), { behavior: "immediate" })
  }

  /** `pragma integrity_check`: `["ok"]` when the store is sound. */
  integrity(): readonly string[] {
    return (this.db.query("pragma integrity_check").all() as { integrity_check: string }[]).map((row) => row.integrity_check)
  }

  /** How many rows `pragma foreign_key_check` reports. */
  foreignKeyViolations(): number {
    return this.db.query("pragma foreign_key_check").all().length
  }

  pragmas(): PragmaNumbers {
    const read = (name: (typeof PRAGMAS)[number]) => Number(Object.values(this.db.query(`pragma ${name}`).get() as Record<string, unknown>)[0])
    return Object.fromEntries(PRAGMAS.map((name) => [name, read(name)])) as unknown as PragmaNumbers
  }

  /** Every entry of `sqlite_master`, by type then name. */
  schema(): readonly SchemaEntry[] {
    return this.db.query("select type, name, tbl_name, sql from sqlite_master order by type, name").all() as SchemaEntry[]
  }

  /** Every row of a table known only at run time, ordered by its primary key (else every column). */
  rowsOf(table: string): IterableIterator<Row> {
    const columns = (this.db.query(`pragma table_info(${quoted(table)})`).all() as { name: string; pk: bigint }[]).map((column) => ({ name: column.name, pk: Number(column.pk) }))
    const keys = columns.filter((column) => column.pk > 0).sort((a, b) => a.pk - b.pk)
    const order = (keys.length > 0 ? keys : columns).map((column) => quoted(column.name)).join(", ")
    return this.db.query(`select * from ${quoted(table)} order by ${order}`).iterate() as IterableIterator<Row>
  }

  /** `VACUUM INTO`: a compact copy at `target`; the store itself is not written. */
  vacuumInto(target: string): void {
    this.orm.run(sql`vacuum into ${target}`)
  }

  /** Switches the store to WAL journaling. */
  setWal(): void {
    this.db.exec("pragma journal_mode = wal")
  }
}

/** Opens a store; the caller closes it. */
export function openStore(path: string, mode: "read" | "write"): Store {
  return new SqliteStore(path, mode)
}

/** Opens a store, runs `work`, and closes it whatever happens. */
export function withStore<T>(path: string, mode: "read" | "write", work: (store: Store) => T): T {
  const store = openStore(path, mode)
  try {
    return work(store)
  } finally {
    store.close()
  }
}
