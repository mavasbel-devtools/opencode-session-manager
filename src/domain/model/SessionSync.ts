import type { ContextScope, HistoryRelation, ProjectMergeResult, SessionOutcome, SyncChecks, SyncSide } from "@session-manager/domain/model/MagicContextSync"

/**
 * Syncing whole sessions from one profile to another: the OpenCode session (its rows in
 * `opencode.db`, with its sub-agent sessions) and its Magic Context state (its rows in
 * `context.db`). Report keys are snake_case.
 */

/** One path rule: text under `from` on the source is written under `to` on the target. */
export interface MapRule {
  readonly from: string
  readonly to: string
}

/** For sessions whose OpenCode history is the same on both sides: whose Magic Context state wins. */
export type Prefer = "further" | "keep" | "replace"

export function isPrefer(value: string): value is Prefer {
  return value === "further" || value === "keep" || value === "replace"
}

export interface SessionSyncInput {
  readonly source: SyncSide
  readonly target: SyncSide
  /** Session ids, or every root session of the source (except plugins' hidden runs). */
  readonly sessions: readonly string[] | "all"
  readonly maps: readonly MapRule[]
  readonly prefer: Prefer
  /** How much Magic Context state goes with each session. */
  readonly context: ContextScope
  readonly dryRun: boolean
}

/**
 * What happens to a session's OpenCode rows:
 * - copy: the target does not have it;
 * - replace: the target's history is a beginning of the source's;
 * - keep: the target's history is the source's, or continues it;
 * - skip: nothing is copied (see the reason).
 */
export type SessionAction = "copy" | "replace" | "keep" | "skip"

export type SessionSkipReason = "not-on-source" | "diverged" | "hidden-run"

/** The relation of the two histories, or `missing` when the target does not have the session. */
export type SessionRelation = HistoryRelation | "missing"

/** The OpenCode action for a session, from how its two histories relate. */
export function actionFor(relation: SessionRelation): SessionAction {
  if (relation === "missing") return "copy"
  if (relation === "source-ahead") return "replace"
  if (relation === "diverged") return "skip"
  return "keep"
}

/** How the session's project on the target was found. */
export type ProjectSource = "derived" | "target" | "source"

export interface SessionSyncOutcome {
  readonly id: string
  readonly title: string | null
  readonly relation: SessionRelation | null
  readonly action: SessionAction
  readonly reason: SessionSkipReason | null
  /** The session and its sub-agent sessions written to the target. */
  readonly sessions_written: number
  readonly rows_written: number
  readonly source_directory: string | null
  readonly target_directory: string | null
  readonly project_id: string | null
  readonly project_source: ProjectSource | null
  /** Text the copy still holds Windows paths in, after the path rewrite. */
  readonly residual_windows_paths: number
  /** What happened to its Magic Context state (null: no Magic Context store on one side, or not attempted). */
  readonly context: SessionOutcome | null
}

export interface SessionSyncChecks {
  readonly integrity_ok: boolean
  readonly foreign_keys_ok: boolean
  /** Every written session has its rows, its project and no source-side folder left. */
  readonly sessions_ok: boolean
  /** The Magic Context checks, when a Magic Context store was synced. */
  readonly context: SyncChecks | null
}

export interface SessionSyncReport {
  readonly source_opencode_db: string
  readonly target_opencode_db: string
  readonly source_context_db: string | null
  readonly target_context_db: string | null
  readonly dry_run: boolean
  readonly context: ContextScope
  readonly sessions: readonly SessionSyncOutcome[]
  /** Magic Context project state merged (context `all`). */
  readonly projects: readonly ProjectMergeResult[]
  readonly user_memories_copied: number
  readonly checks: SessionSyncChecks
  /** Where the target's original stores were moved, or null when nothing was swapped. */
  readonly backup_dir: string | null
  /** The command that puts both originals back, or null. */
  readonly rollback: string | null
}

export const SESSION_SKIP_TEXT: Readonly<Record<SessionSkipReason, string>> = {
  "not-on-source": "the session is not in the source's OpenCode store",
  diverged: "the two histories differ after a shared beginning; nothing is copied",
  "hidden-run": "a session a plugin ran for its own work (Magic Context's historian or dreamer); --all leaves it out, --session takes it",
}
