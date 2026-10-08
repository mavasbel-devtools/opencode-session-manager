import {
  STRUCTURED_COLUMNS,
  UNTOUCHED_TABLES,
  type MigrationVerification,
  type ProjectRecord,
  type RewriteReport,
} from "@session-manager/domain/model/Migration"
import type { MigrationDatabase } from "@session-manager/domain/ports/outbound/MigrationStorePort"
import type { ProjectIdentityPort } from "@session-manager/domain/ports/outbound/ProjectIdentityPort"
import type { SqlitePort } from "@session-manager/domain/ports/outbound/SqlitePort"
import type { TextRewriter } from "@session-manager/domain/services/PathRewriter"
import { isWithin, sessionSubpath } from "@session-manager/domain/services/PosixPaths"

export interface VerifyInput {
  readonly db: MigrationDatabase
  /** The working copy's path, for the integrity check on a second, read-only connection. */
  readonly dbPath: string
  /** The rewritten copy of every input, base first: none of their rows may go missing. */
  readonly inputs: readonly string[]
  readonly rewrites: readonly RewriteReport[]
  readonly rewriter: TextRewriter
}

const WINDOWS_PATH = /^[A-Za-z]:[\\/]|\\/

/**
 * The gates a migrated copy has to pass before it may replace the live database. Rows of the
 * project-scoped tables may legitimately merge into one another when ids are re-keyed, so only
 * those tables are left out of the row check.
 */
export class MigrationVerifier {
  private readonly sqlite: SqlitePort
  private readonly identity: ProjectIdentityPort

  constructor(sqlite: SqlitePort, identity: ProjectIdentityPort) {
    this.sqlite = sqlite
    this.identity = identity
  }

  /** Runs every gate; the caller owns `db` and closes it. */
  verify(input: VerifyInput): MigrationVerification {
    const { db, rewriter } = input
    const scoped = new Set(["project", ...db.projectReferences().map((reference) => reference.table)])
    const checked = db.tables().filter((table) => !scoped.has(table))
    const missing: Record<string, Readonly<Record<string, number>>> = {}
    for (const copy of input.inputs) {
      const absent = Object.fromEntries(Object.entries(db.missingRows(copy, checked)).filter(([, count]) => count > 0))
      if (Object.keys(absent).length > 0) missing[copy] = absent
    }

    const residual: Record<string, number> = {}
    for (const table of db.tables().filter((name) => !UNTOUCHED_TABLES.includes(name))) {
      for (const column of db.columns(table)) {
        let count = 0
        db.editText(table, column, (value) => {
          if (rewriter.residual(value)) count++
          return value
        })
        if (count > 0) residual[`${table}.${column}`] = count
      }
    }

    const sessions = db.sessions()
    const windows = [
      ...new Set(
        sessions
          .map((session) => session.directory)
          .filter((directory): directory is string => directory !== null)
          .filter((directory) => WINDOWS_PATH.test(directory) || rewriter.residual(directory)),
      ),
    ].sort()

    const worktrees = new Map(db.projects().map((project: ProjectRecord) => [project.id, project.worktree]))
    let mismatches = 0
    for (const session of sessions) {
      const worktree = worktrees.get(session.projectId)
      if (worktree === undefined || session.directory === null) continue
      const folder = this.identity.resolve(session.directory)?.real ?? session.directory
      if (!isWithin(worktree, folder)) continue
      if (sessionSubpath(worktree, folder) !== session.path) mismatches++
    }

    const rowCounts = db.rowCounts()
    const integrity = this.sqlite.integrity(input.dbPath)

    const checks = {
      integrity_ok: integrity.integrity_ok,
      foreign_keys_ok: integrity.foreign_key_violations === 0,
      rows_kept: Object.keys(missing).length === 0,
      windows_sessions_gone: windows.length === 0,
      structured_paths_clean: STRUCTURED_COLUMNS.every((column) => residual[column] === undefined),
      subpaths_consistent: mismatches === 0,
      json_intact: input.rewrites.every((rewrite) => rewrite.json_broken === 0),
    }
    return {
      ok: Object.values(checks).every(Boolean),
      checks,
      missing_rows: missing,
      windows_sessions: windows,
      residual,
      subpath_mismatches: mismatches,
      row_counts: rowCounts,
    }
  }
}
