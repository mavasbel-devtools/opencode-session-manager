import type { OpenedProfile } from "@session-manager/domain/model/BrowserState"
import { profileAt } from "@session-manager/domain/model/Profile"
import type { SessionGeneration } from "@session-manager/domain/model/SessionCatalog"

/**
 * Copying one session's Magic Context state from one profile's store to another's, for sessions
 * that exist on both sides under the same id. Report keys are snake_case.
 */

/** Magic Context labels each row with the OpenCode generation that wrote it. */
export type Harness = "opencode" | "opencode2"

export function harnessFor(generation: SessionGeneration): Harness {
  return generation === "v2" ? "opencode2" : "opencode"
}

/**
 * How the session's message history on the target relates to the source's. Magic Context state
 * points at messages by id and by position, so it stays valid only where the target holds the same
 * messages in the same order: the source's history must be the target's, or a beginning of it.
 */
export type HistoryRelation = "same" | "target-ahead" | "source-ahead" | "diverged"

export function relationOf(source: readonly string[], target: readonly string[]): HistoryRelation {
  const shared = Math.min(source.length, target.length)
  for (let index = 0; index < shared; index++) if (source[index] !== target[index]) return "diverged"
  if (source.length === target.length) return "same"
  return source.length < target.length ? "target-ahead" : "source-ahead"
}

export type Resolution = "replace" | "skip" | "further"

/** One queued copy, as the user decided it. */
export interface SyncRequest {
  readonly id: string
  /**
   * For a session the target already has state for: "replace" overwrites it, "skip" keeps it, and
   * "further" replaces it only when the source's summaries reach further into the history.
   */
  readonly resolution: Resolution
}

/** One side of a sync: where its stores are, and where they can be read from. */
export interface SyncSide {
  readonly opencodeDb: string
  readonly contextDb: string
  /** Readable copies, when the stores cannot be read in place (null: read them in place). */
  readonly readableOpencodeDb: string | null
  readonly readableContextDb: string | null
}

/** A side of a sync as an opened profile gives it: in place, or from its snapshot. */
export function syncSideOf(opened: OpenedProfile): SyncSide {
  const { profile } = opened.catalog
  const readable = opened.snapshot === null ? null : profileAt(profile.name, opened.snapshot)
  return {
    opencodeDb: profile.opencodeDb,
    contextDb: profile.contextDb,
    readableOpencodeDb: readable?.opencodeDb ?? null,
    readableContextDb: readable?.contextDb ?? null,
  }
}

export interface SyncInput {
  readonly source: SyncSide
  readonly target: SyncSide
  readonly sessions: readonly SyncRequest[]
  /** Build the copy and check it, but leave the target untouched. */
  readonly dryRun: boolean
}

/** What to copy for one session, as the store adapter receives it. */
export interface SessionCopy {
  readonly id: string
  readonly sourceHarness: Harness
  readonly targetHarness: Harness
  /** Magic Context's project identity for the session on the target. */
  readonly targetProject: string
  /** The source's project identity, whose memories created by this session are copied. */
  readonly sourceProject: string | null
}

export interface SessionCopyCounts {
  readonly compartments: number
  readonly tags: number
  readonly notes: number
  readonly memories_copied: number
  readonly memories_already_there: number
}

export type SkipReason =
  | "resolution-skip"
  | "target-further"
  | "not-on-source"
  | "not-on-target"
  | "no-state"
  | "source-ahead"
  | "diverged"
  | "stale-anchors"
  | "no-project"
  | "busy"

export interface SessionOutcome {
  readonly id: string
  readonly status: "copied" | "skipped"
  readonly reason: SkipReason | null
  readonly relation: HistoryRelation | null
  readonly counts: SessionCopyCounts | null
  /** Text the copy still holds Windows paths in, after the path rewrite (when one was configured). */
  readonly residual_windows_paths: number
}

export interface SyncChecks {
  readonly integrity_ok: boolean
  readonly foreign_keys_ok: boolean
  /** Every copied summary points at messages the target's history holds. */
  readonly anchors_ok: boolean
  readonly counts_ok: boolean
}

/** The names of the checks that did not pass, in order. */
export function failedChecks(checks: object): string[] {
  return Object.entries(checks)
    .filter(([, ok]) => ok !== true)
    .map(([name]) => name)
}

export interface SyncReport {
  readonly source_context_db: string
  readonly target_context_db: string
  readonly format: number
  readonly dry_run: boolean
  readonly sessions: readonly SessionOutcome[]
  readonly checks: SyncChecks | null
  /** Where the target's original store was moved, or null when nothing was swapped. */
  readonly backup_dir: string | null
}

export const SKIP_TEXT: Readonly<Record<SkipReason, string>> = {
  "resolution-skip": "skipped by choice: the target keeps its own state",
  "target-further": "the target's own summaries reach as far or further into the history",
  "not-on-source": "the session is not in the source's OpenCode store",
  "not-on-target": "the session is not in the target's OpenCode store (sync the session first)",
  "no-state": "no Magic Context state for this OpenCode generation on the source",
  "source-ahead": "the source has messages the target lacks (sync the session first)",
  diverged: "the two histories differ",
  "stale-anchors": "its summaries point at messages the target's history does not hold (state written for an older copy of the session)",
  "no-project": "Magic Context's project for the session on the target cannot be resolved here",
  busy: "Magic Context is working on the session on the target (a wrapup or a history run); try again when it finishes",
}

const SKIP_SHORT: Readonly<Record<SkipReason, string>> = {
  "resolution-skip": "kept by choice",
  "target-further": "target further",
  "not-on-source": "not on the source",
  "not-on-target": "not on the target",
  "no-state": "no state",
  "source-ahead": "source ahead",
  diverged: "diverged",
  "stale-anchors": "stale summaries",
  "no-project": "no project",
  busy: "busy",
}

/** A sync report in four lines, for a person. */
export function syncSummary(report: SyncReport): string[] {
  const copied = report.sessions.filter((session) => session.counts !== null)
  const sum = (key: keyof SessionCopyCounts) => copied.reduce((total, session) => total + session.counts![key], 0)
  const skipped = new Map<SkipReason, number>()
  for (const session of report.sessions) if (session.reason !== null) skipped.set(session.reason, (skipped.get(session.reason) ?? 0) + 1)
  return [
    `${report.dry_run ? "Dry run" : "Applied"}: ${copied.length} of ${report.sessions.length} sessions copied into ${report.target_context_db}`,
    `${sum("compartments")} summaries · ${sum("tags")} tags · ${sum("notes")} notes · ${sum("memories_copied")} memories copied (${sum("memories_already_there")} already there)`,
    skipped.size === 0 ? "Nothing skipped." : `Skipped: ${[...skipped].map(([reason, count]) => `${count} ${SKIP_SHORT[reason]}`).join(", ")}`,
    report.backup_dir === null
      ? "The target store was not changed."
      : `Original kept in ${report.backup_dir} (undo: opencode-session-manager rollback ${report.backup_dir} --db ${report.target_context_db})`,
  ]
}
