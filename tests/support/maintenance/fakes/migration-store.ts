import type { MergeTable, ProjectIdentity, ProjectRecord, ProjectReference, SessionRef } from "@session-manager/domain/model/Migration"
import type { MigrationDatabase, MigrationStorePort } from "@session-manager/domain/ports/outbound/MigrationStorePort"
import type { ProjectIdentityPort } from "@session-manager/domain/ports/outbound/ProjectIdentityPort"

type Row = Record<string, unknown>

/** One in-memory database: tables of plain rows, with the rest of the answers scripted. */
export class FakeMigrationDatabase implements MigrationDatabase {
  public readonly data = new Map<string, Row[]>()
  public references: ProjectReference[] = []
  public mergeResult: MergeTable[] = []
  public readonly merged: string[] = []
  /** Per input path and table, rows reported missing. */
  public missing: Record<string, Record<string, number>> = {}
  public closed = false
  public rolledBack = 0

  constructor(tables: Record<string, Row[]> = {}) {
    for (const [name, rows] of Object.entries(tables)) this.data.set(name, rows.map((row) => ({ ...row })))
  }

  rows(table: string): Row[] {
    return this.data.get(table) ?? []
  }

  tables(): readonly string[] {
    return [...this.data.keys()]
  }

  columns(table: string): readonly string[] {
    return [...new Set(this.rows(table).flatMap((row) => Object.keys(row)))]
  }

  editText(table: string, column: string, edit: (value: string) => string): number {
    let written = 0
    for (const row of this.rows(table)) {
      const value = row[column]
      if (typeof value !== "string") continue
      const next = edit(value)
      if (next === value) continue
      row[column] = next
      written++
    }
    return written
  }

  merge(sourcePath: string): readonly MergeTable[] {
    this.merged.push(sourcePath)
    return this.mergeResult
  }

  missingRows(sourcePath: string, tables: readonly string[]): Readonly<Record<string, number>> {
    const scripted = this.missing[sourcePath] ?? {}
    return Object.fromEntries(tables.map((table) => [table, scripted[table] ?? 0]))
  }

  rowCounts(): Readonly<Record<string, number>> {
    return Object.fromEntries(this.tables().map((table) => [table, this.rows(table).length]))
  }

  sessions(): readonly SessionRef[] {
    return ["session", "session_v2"].flatMap((table) =>
      this.rows(table).map((row, index) => ({
        table,
        rowid: index,
        directory: row["directory"] as string | null,
        projectId: row["project_id"] as string,
        path: row["path"] as string | null,
      })),
    )
  }

  projects(): readonly ProjectRecord[] {
    return this.rows("project").map((row) => ({ ...row }) as ProjectRecord)
  }

  projectReferences(): readonly ProjectReference[] {
    return this.references
  }

  insertProject(project: ProjectRecord): void {
    if (this.rows("project").some((row) => row["id"] === project.id)) return
    this.data.set("project", [...this.rows("project"), { ...project }])
  }

  updateProject(id: string, worktree: string, vcs: string | null): void {
    for (const row of this.rows("project")) {
      if (row["id"] === id) Object.assign(row, { worktree, vcs })
    }
  }

  repoint(reference: ProjectReference, from: string, to: string): void {
    for (const row of this.rows(reference.table)) {
      if (row[reference.column] === from) row[reference.column] = to
    }
  }

  deleteProject(id: string): void {
    this.data.set(
      "project",
      this.rows("project").filter((row) => row["id"] !== id),
    )
  }

  updateSession(session: SessionRef, projectId: string, path: string | null): void {
    Object.assign(this.rows(session.table)[session.rowid] as Row, { project_id: projectId, path })
  }

  transaction<T>(work: () => T): T {
    try {
      return work()
    } catch (error) {
      this.rolledBack++
      throw error
    }
  }

  close(): void {
    this.closed = true
  }
}

/** Hands out a fake database per path, creating an empty one on first open. */
export class FakeMigrationStore implements MigrationStorePort {
  public readonly databases = new Map<string, FakeMigrationDatabase>()
  public readonly opened: string[] = []

  open(dbPath: string): FakeMigrationDatabase {
    this.opened.push(dbPath)
    const existing = this.databases.get(dbPath)
    if (existing !== undefined) {
      existing.closed = false
      return existing
    }
    const created = new FakeMigrationDatabase()
    this.databases.set(dbPath, created)
    return created
  }
}

/** Scripted project resolution: a folder resolves only when listed. */
export class FakeIdentity implements ProjectIdentityPort {
  public readonly known = new Map<string, ProjectIdentity>()

  add(directory: string, id: string, worktree: string, vcs: string | null = null, real = directory): void {
    this.known.set(directory, { id, worktree, vcs, real })
  }

  resolve(directory: string): ProjectIdentity | null {
    return this.known.get(directory) ?? null
  }
}
