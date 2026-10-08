import { DatabaseSync, type SQLInputValue } from "node:sqlite"
import { SESSION_TABLES, type MergeTable, type ProjectRecord, type ProjectReference, type SessionRef } from "#domain/model/Migration.ts"
import type { MigrationDatabase, MigrationStorePort } from "#domain/ports/outbound/MigrationStorePort.ts"

interface TableInfoRow {
  readonly name: string
  readonly pk: number
}

interface ForeignKeyRow {
  readonly table: string
  readonly from: string
}

/** Rows read per batch while editing text, so a table of large history rows never sits in memory whole. */
const BATCH = 2000

function quote(name: string): string {
  return `"${name.replaceAll('"', '""')}"`
}

class NodeMigrationDatabase implements MigrationDatabase {
  private readonly db: DatabaseSync

  constructor(dbPath: string) {
    this.db = new DatabaseSync(dbPath)
    // Project ids are repointed by hand across several tables; the foreign-key check runs at the end.
    this.db.exec("pragma foreign_keys = off")
  }

  tables(): readonly string[] {
    const rows = this.db
      .prepare("select name from main.sqlite_master where type = 'table' and name not like 'sqlite_%' order by rowid")
      .all() as unknown as { name: string }[]
    return rows.map((row) => row.name)
  }

  columns(table: string, schema = "main"): readonly string[] {
    return this.tableInfo(table, schema).map((row) => row.name)
  }

  editText(table: string, column: string, edit: (value: string) => string): number {
    const read = this.db.prepare(
      `select rowid as id, ${quote(column)} as value from ${quote(table)}
       where rowid > ? and typeof(${quote(column)}) = 'text' order by rowid limit ${BATCH}`,
    )
    // A rewrite can make two rows share a primary key (two spellings of one folder); the later one wins.
    const write = this.db.prepare(`update or replace ${quote(table)} set ${quote(column)} = ? where rowid = ?`)
    let written = 0
    let last = -Infinity
    for (;;) {
      const rows = read.all(last) as unknown as { id: number; value: string }[]
      if (rows.length === 0) return written
      this.transaction(() => {
        for (const row of rows) {
          const next = edit(row.value)
          if (next !== row.value) {
            write.run(next, row.id)
            written++
          }
        }
      })
      last = (rows[rows.length - 1] as { id: number }).id
    }
  }

  merge(sourcePath: string): readonly MergeTable[] {
    return this.withSource(sourcePath, (tables) =>
      this.transaction(() =>
        tables.map((table) => {
          const columns = this.sharedColumns(table)
          const list = columns.map(quote).join(", ")
          const keys = this.keyColumns(table, columns)
          const absent = keys.map((key) => `m.${quote(key)} is s.${quote(key)}`).join(" and ")
          const result = this.db
            .prepare(
              `insert or ignore into main.${quote(table)} (${list}) select ${columns.map((c) => `s.${quote(c)}`).join(", ")}
               from source.${quote(table)} s where not exists (select 1 from main.${quote(table)} m where ${absent})`,
            )
            .run()
          return { name: table, source_rows: this.count(table, "source"), inserted: Number(result.changes) }
        }),
      ),
    )
  }

  missingRows(sourcePath: string, tables: readonly string[]): Readonly<Record<string, number>> {
    return this.withSource(sourcePath, (shared) => {
      const missing: Record<string, number> = {}
      for (const table of shared.filter((name) => tables.includes(name))) {
        const keys = this.keyColumns(table, this.sharedColumns(table))
        const absent = keys.map((key) => `m.${quote(key)} is s.${quote(key)}`).join(" and ")
        const row = this.db
          .prepare(
            `select count(*) as n from source.${quote(table)} s
             where not exists (select 1 from main.${quote(table)} m where ${absent})`,
          )
          .get() as { n: number }
        missing[table] = row.n
      }
      return missing
    })
  }

  rowCounts(): Readonly<Record<string, number>> {
    return Object.fromEntries(this.tables().map((table) => [table, this.count(table, "main")]))
  }

  sessions(): readonly SessionRef[] {
    const present = this.tables()
    return SESSION_TABLES.filter((table) => present.includes(table)).flatMap((table) =>
      (
        this.db
          .prepare(`select rowid as rowid, directory, project_id as projectId, path from ${quote(table)} order by rowid`)
          .all() as unknown as Omit<SessionRef, "table">[]
      ).map((row) => ({ table, rowid: row.rowid, directory: row.directory, projectId: row.projectId, path: row.path })),
    )
  }

  projects(): readonly ProjectRecord[] {
    const statement = this.db.prepare("select * from project order by rowid")
    // Timestamps are read as BigInt so a copied row is written back exactly as it was.
    statement.setReadBigInts(true)
    return statement.all() as unknown as ProjectRecord[]
  }

  projectReferences(): readonly ProjectReference[] {
    return this.tables()
      .filter((table) => !SESSION_TABLES.includes(table))
      .flatMap((table) =>
        (this.db.prepare(`pragma foreign_key_list(${quote(table)})`).all() as unknown as ForeignKeyRow[])
          .filter((key) => key.table === "project")
          .map((key) => ({ table, column: key.from })),
      )
  }

  insertProject(project: ProjectRecord): void {
    const columns = this.columns("project").filter((column) => column in project)
    this.db
      .prepare(
        `insert or ignore into project (${columns.map(quote).join(", ")}) values (${columns.map(() => "?").join(", ")})`,
      )
      .run(...columns.map((column) => project[column] as SQLInputValue))
  }

  updateProject(id: string, worktree: string, vcs: string | null): void {
    this.db.prepare("update project set worktree = ?, vcs = ? where id = ?").run(worktree, vcs, id)
  }

  repoint(reference: ProjectReference, from: string, to: string): void {
    const table = quote(reference.table)
    const column = quote(reference.column)
    this.db.prepare(`update or ignore ${table} set ${column} = ? where ${column} = ?`).run(to, from)
    this.db.prepare(`delete from ${table} where ${column} = ?`).run(from)
  }

  deleteProject(id: string): void {
    this.db.prepare("delete from project where id = ?").run(id)
  }

  updateSession(session: SessionRef, projectId: string, path: string | null): void {
    this.db
      .prepare(`update ${quote(session.table)} set project_id = ?, path = ? where rowid = ?`)
      .run(projectId, path, session.rowid)
  }

  transaction<T>(work: () => T): T {
    this.db.exec("begin")
    try {
      const result = work()
      this.db.exec("commit")
      return result
    } catch (error) {
      this.db.exec("rollback")
      throw error
    }
  }

  close(): void {
    this.db.close()
  }

  private withSource<T>(sourcePath: string, work: (shared: readonly string[]) => T): T {
    // Only ever another working copy this migration built, never a migration source itself.
    this.db.prepare("attach database ? as source").run(sourcePath)
    try {
      const theirs = this.db
        .prepare("select name from source.sqlite_master where type = 'table' and name not like 'sqlite_%'")
        .all() as unknown as { name: string }[]
      const names = new Set(theirs.map((row) => row.name))
      return work(this.tables().filter((table) => names.has(table)))
    } finally {
      this.db.exec("detach database source")
    }
  }

  private sharedColumns(table: string): readonly string[] {
    const theirs = new Set(this.columns(table, "source"))
    return this.columns(table).filter((column) => theirs.has(column))
  }

  /** The primary key, or every shared column for a table without one. */
  private keyColumns(table: string, shared: readonly string[]): readonly string[] {
    const keys = this.tableInfo(table, "main")
      .filter((row) => row.pk > 0)
      .sort((a, b) => a.pk - b.pk)
      .map((row) => row.name)
    return keys.length > 0 && keys.every((key) => shared.includes(key)) ? keys : shared
  }

  private tableInfo(table: string, schema: string): readonly TableInfoRow[] {
    return this.db.prepare(`pragma ${schema}.table_info(${quote(table)})`).all() as unknown as TableInfoRow[]
  }

  private count(table: string, schema: string): number {
    return (this.db.prepare(`select count(*) as n from ${schema}.${quote(table)}`).get() as { n: number }).n
  }
}

/** The migration's writes, on a working copy only. Foreign keys are enforced by the final check instead. */
export class NodeMigrationStoreAdapter implements MigrationStorePort {
  open(dbPath: string): MigrationDatabase {
    return new NodeMigrationDatabase(dbPath)
  }
}
