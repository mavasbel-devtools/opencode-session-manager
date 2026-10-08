import type { MergeTable, ProjectRecord, ProjectReference, SessionRef } from "#domain/model/Migration.ts"

/**
 * Writes to a migration's working copy. It is only ever opened on a copy this tool built with
 * `VACUUM INTO`, never on the live database or on a migration source.
 */
export interface MigrationDatabase {
  /** User tables, in schema order. */
  tables(): readonly string[]
  columns(table: string): readonly string[]
  /**
   * Visits every TEXT cell of a column and writes back the value `edit` returns when it differs.
   * Returns how many cells were written.
   */
  editText(table: string, column: string, edit: (value: string) => string): number
  /** Copies every row of `sourcePath` whose primary key (or whole row, without one) is not here yet. */
  merge(sourcePath: string): readonly MergeTable[]
  /** Per table present in both, how many of `sourcePath`'s primary keys are absent here. */
  missingRows(sourcePath: string, tables: readonly string[]): Readonly<Record<string, number>>
  rowCounts(): Readonly<Record<string, number>>
  sessions(): readonly SessionRef[]
  projects(): readonly ProjectRecord[]
  /** Every column, outside the session tables, declared as a foreign key to `project.id`. */
  projectReferences(): readonly ProjectReference[]
  /** Inserts the project unless one with that id exists. */
  insertProject(project: ProjectRecord): void
  updateProject(id: string, worktree: string, vcs: string | null): void
  /** Repoints `column` from one project id to another, dropping rows that would then collide. */
  repoint(reference: ProjectReference, from: string, to: string): void
  deleteProject(id: string): void
  updateSession(session: SessionRef, projectId: string, path: string | null): void
  /** Runs `work` in one transaction, rolled back when it throws. */
  transaction<T>(work: () => T): T
  close(): void
}

export interface MigrationStorePort {
  open(dbPath: string): MigrationDatabase
}
