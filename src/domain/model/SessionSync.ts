import type { StaleLock } from "@session-manager/domain/model/StoreLock"
import { projectLines, SKIP_SHORT, type ContextScope, type HistoryRelation, type ProjectMergeResult, type SessionOutcome, type SyncChecks, type SyncSide } from "@session-manager/domain/model/MagicContextSync"

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

/**
 * For sessions whose two histories differ after a shared beginning: `skip` leaves both as they are;
 * `fork` writes the source's version into the target as a new session, an OpenCode fork of the
 * target's own version at the last message both share.
 */
export type Diverged = "skip" | "fork"

export function isDiverged(value: string): value is Diverged {
  return value === "skip" || value === "fork"
}

export interface SessionSyncInput {
  readonly source: SyncSide
  readonly target: SyncSide
  /** Session ids, or every root session of the source (except plugins' hidden runs). */
  readonly sessions: readonly string[] | "all"
  readonly maps: readonly MapRule[]
  readonly prefer: Prefer
  /** `prefer` for single sessions (by root session id), over the one above. */
  readonly preferFor?: Readonly<Record<string, Prefer>>
  /** How much Magic Context state goes with each session. */
  readonly context: ContextScope
  readonly dryRun: boolean
  /** Refuse the whole sync when Magic Context is working on a requested session (default: skip it). */
  readonly strict?: boolean
  /** What to do with diverged sessions (default `skip`). */
  readonly diverged?: Diverged
  /** `diverged` for single sessions (by root session id), over the one above. */
  readonly divergedFor?: Readonly<Record<string, Diverged>>
}

/**
 * What happens to a session's OpenCode rows:
 * - copy: the target does not have it;
 * - replace: the target's history is a beginning of the source's;
 * - keep: the target's history is the source's, or continues it;
 * - fork: the histories diverged and the source's version is written as a fork of the target's;
 * - skip: nothing is copied (see the reason).
 */
export type SessionAction = "copy" | "replace" | "keep" | "fork" | "skip"

export type SessionSkipReason = "not-on-source" | "diverged" | "hidden-run" | "nothing-shared"

/** The relation of the two histories, or `missing` when the target does not have the session. */
export type SessionRelation = HistoryRelation | "missing"

/** The OpenCode action for a session, from how its two histories relate and what diverged ones get. */
export function actionFor(relation: SessionRelation, diverged: Diverged = "skip"): SessionAction {
  if (relation === "missing") return "copy"
  if (relation === "source-ahead") return "replace"
  if (relation === "diverged") return diverged
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
  /** The session and its sub-agent sessions written to the target (a fork: the fork alone). */
  readonly sessions_written: number
  /** The new session a `fork` wrote on the target, or null. */
  readonly fork_id: string | null
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
  /** Locks left by processes that no longer exist, removed before the sync wrote anything. */
  readonly stale_locks_cleared: readonly StaleLock[]
}

export const SESSION_SKIP_TEXT: Readonly<Record<SessionSkipReason, string>> = {
  "not-on-source": "the session is not in the source's OpenCode store",
  diverged: "the two histories differ after a shared beginning; nothing is copied (--diverged fork keeps both)",
  "hidden-run": "a session a plugin ran for its own work (Magic Context's historian or dreamer); --all leaves it out, --session takes it",
  "nothing-shared": "the two histories differ from their first message, so there is no point to fork from; nothing is copied",
}

const SESSION_SKIP_SHORT: Readonly<Record<SessionSkipReason, string>> = {
  "not-on-source": "not on the source",
  diverged: "diverged",
  "hidden-run": "plugin run",
  "nothing-shared": "nothing shared",
}

/** What happened to a session's Magic Context state, in a few words (null: not part of the sync). */
export function contextOutcomeText(outcome: SessionOutcome | null): string | null {
  if (outcome === null) return null
  return outcome.status === "copied" ? "Magic Context copied" : `Magic Context kept (${SKIP_SHORT[outcome.reason!]})`
}

/** A whole-session sync report in a few lines, for a person. */
export function sessionSyncLines(report: SessionSyncReport): string[] {
  const count = (action: SessionAction) => report.sessions.filter((session) => session.action === action).length
  const contexts = report.sessions.map((session) => session.context).filter((outcome) => outcome !== null)
  const copied = contexts.filter((outcome) => outcome.status === "copied")
  const sum = (key: "compartments" | "tags" | "memories_copied") => copied.reduce((total, outcome) => total + (outcome.counts?.[key] ?? 0), 0)
  const skipped = new Map<string, number>()
  for (const session of report.sessions) if (session.reason !== null) skipped.set(SESSION_SKIP_SHORT[session.reason], (skipped.get(SESSION_SKIP_SHORT[session.reason]) ?? 0) + 1)
  return [
    `${report.dry_run ? "Dry run" : "Applied"}: ${count("copy")} copied, ${count("replace")} replaced, ${count("keep")} kept, ${count("fork") === 0 ? "" : `${count("fork")} forked, `}${count("skip")} skipped → ${report.target_opencode_db}`,
    ...(report.target_context_db === null
      ? []
      : [`Magic Context: state copied for ${copied.length} of ${contexts.length} sessions (${sum("compartments")} summaries · ${sum("tags")} tags · ${sum("memories_copied")} memories)`]),
    ...projectLines(report),
    ...report.sessions
      .filter((session) => session.fork_id !== null)
      .map((session) => `Forked ${session.id} → ${session.fork_id}: Magic Context gives it ${session.id}'s state on its first prompt`),
    ...(skipped.size === 0 ? [] : [`Skipped: ${[...skipped].map(([reason, total]) => `${total} ${reason}`).join(", ")}`]),
    report.rollback === null ? "The target stores were not changed." : `Originals kept; undo: ${report.rollback}`,
  ]
}
