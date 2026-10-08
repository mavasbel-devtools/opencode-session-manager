/** What a migration is asked to do, and the evidence it leaves. Report keys are snake_case. */

/** A folder that moved: every path at or below `from` is rewritten to the same place below `to`. */
export interface Relocation {
  readonly from: string
  readonly to: string
}

/** How Windows paths map onto this machine. Only the Windows user's profile folder is rewritten. */
export interface PathMapping {
  /** The absolute POSIX home the profile maps to, without a trailing slash. */
  readonly home: string
  readonly windowsUser: string
  /** The drive letter the profile lives on, usually `C`. */
  readonly drive: string
  /** POSIX folders where that Windows drive is mounted, e.g. `/run/media/me/Windows`. */
  readonly mounts: readonly string[]
  /** Applied after the profile mapping, in the order given. */
  readonly relocations: readonly Relocation[]
}

/** Tables that are never rewritten: credentials stay byte-identical, and OpenCode's own migration log is not data. */
export const UNTOUCHED_TABLES: readonly string[] = ["account", "control_account", "credential", "migration"]

/** The two session tables; every other table that references `project` is repointed as a whole. */
export const SESSION_TABLES: readonly string[] = ["session", "session_v2"]

/**
 * The columns OpenCode reads to find a session's folder. A Windows profile path left in any of them
 * fails the migration; one left in history text is reported but does not.
 */
export const STRUCTURED_COLUMNS: readonly string[] = [
  "session.directory",
  "session_v2.directory",
  "project.worktree",
  "project_directory.directory",
  "worktree.directory",
]

/** The project row every database has and nothing re-keys. */
export const GLOBAL_PROJECT = "global"

/** One session row, from either session table. */
export interface SessionRef {
  readonly table: string
  readonly rowid: number
  readonly directory: string | null
  readonly projectId: string
  readonly path: string | null
}

/** A `project` row with every column, so a re-keyed copy keeps the name, icon and commands. */
export type ProjectRecord = Readonly<Record<string, unknown>> & { readonly id: string; readonly worktree: string }

/** A table that references `project.id`. */
export interface ProjectReference {
  readonly table: string
  readonly column: string
}

/** The project OpenCode derives for a folder on this machine. */
export interface ProjectIdentity {
  readonly id: string
  readonly worktree: string
  readonly vcs: string | null
  /** The folder with every symlink resolved. */
  readonly real: string
}

export interface RewriteReport {
  readonly source: string
  readonly cells_rewritten: number
  readonly by_column: Readonly<Record<string, number>>
  /** Cells that were valid JSON before the rewrite and are not after it. Must be 0. */
  readonly json_broken: number
}

export interface MergeTable {
  readonly name: string
  readonly source_rows: number
  readonly inserted: number
}

export interface MergeReport {
  readonly source: string
  readonly tables: readonly MergeTable[]
}

export interface RekeyReport {
  readonly projects_remapped: number
  readonly projects_created: number
  readonly projects_dropped: number
  readonly sessions_rekeyed: number
  readonly subpaths_fixed: number
  /** Session folders that do not exist on this machine; their sessions keep their project. */
  readonly missing_directories: readonly string[]
}

export interface MigrationChecks {
  readonly integrity_ok: boolean
  readonly foreign_keys_ok: boolean
  readonly rows_kept: boolean
  /** No session folder is still a Windows path or inside the Windows profile. */
  readonly windows_sessions_gone: boolean
  readonly structured_paths_clean: boolean
  readonly subpaths_consistent: boolean
  readonly json_intact: boolean
}

export interface MigrationVerification {
  readonly ok: boolean
  readonly checks: MigrationChecks
  /** Per input and table, rows whose primary key is absent from the result (project-scoped tables excluded). */
  readonly missing_rows: Readonly<Record<string, Readonly<Record<string, number>>>>
  /** Session folders that are still Windows paths. */
  readonly windows_sessions: readonly string[]
  /** Cells per `table.column` still holding a Windows profile path. */
  readonly residual: Readonly<Record<string, number>>
  readonly subpath_mismatches: number
  readonly row_counts: Readonly<Record<string, number>>
}

export interface MigrationInputs {
  /** The live database: the base the sources are merged into. */
  readonly dbPath: string
  /** Databases to merge in, e.g. a Windows `opencode.db` copied to this machine. */
  readonly sources: readonly string[]
  readonly mapping: PathMapping
}
