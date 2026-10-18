import type { ProjectMergeResult, SyncSide } from "@session-manager/domain/model/MagicContextSync"
import type { StaleLock } from "@session-manager/domain/model/StoreLock"
import type { MapRule } from "@session-manager/domain/model/SessionSync"
import type { NameRename } from "@session-manager/domain/model/NameRename"

/** `relocate`: sessions moved to the folders their files now live in, inside one profile. */
export interface RelocateInput {
  readonly profile: SyncSide
  readonly maps: readonly MapRule[]
  /** `--rename <folder>=<name>` rules: `from` the folder's old absolute path, `to` its new name. */
  readonly renames: readonly MapRule[]
  /** Every session in a mapped folder, or these sessions (each with its sub-agent sessions). */
  readonly sessions: "all" | readonly string[]
  /** Also relink sessions already in their folder whose Magic Context project is not that folder's. */
  readonly relink?: boolean
  readonly dryRun: boolean
}

/** Why a requested session was not moved. */
export type RelocateSkipReason = "not-found" | "not-mapped" | "folder-missing"

/** One session row moved: its folder, and the projects OpenCode and Magic Context derive for it there. */
export interface RelocatedSession {
  readonly id: string
  /** The root of its family (itself for a root session). */
  readonly root: string
  readonly title: string | null
  readonly from_directory: string
  readonly to_directory: string
  readonly from_project: string
  readonly to_project: string
  /** Magic Context's project for the session before and after (null: it has none recorded). */
  readonly context_from_project: string | null
  readonly context_to_project: string | null
}

export interface RelocateSkip {
  readonly id: string
  readonly directory: string | null
  readonly reason: RelocateSkipReason
  /** The folder the session would move to, when a rule maps it. */
  readonly to_directory: string | null
}

/** Rows whose text was rewritten, and rows still holding an old folder afterwards, per table. */
export interface TextRewriteCounts {
  readonly rows: Readonly<Record<string, number>>
  readonly residual: Readonly<Record<string, number>>
  /** Rows of tables never rewritten (project records, content-addressed blobs) that mention an old folder. */
  readonly kept: Readonly<Record<string, number>>
}

export interface ContextTextRewriteCounts extends TextRewriteCounts {
  /** Memories left as they were: rewritten, they would repeat another memory of their project. */
  readonly memory_conflicts: number
  /** Cached prompt snapshots cleared (Magic Context rebuilds them). */
  readonly snapshots_cleared: number
}

export interface RelocateChecks {
  readonly integrity_ok: boolean
  readonly foreign_keys_ok: boolean
  /** Every moved session is stored in its new folder, under a project the store has. */
  readonly sessions_ok: boolean
  /** No rewritten row still holds an old folder. */
  readonly text_ok: boolean
  /** Magic Context's store, when the profile has one. */
  readonly context: { readonly integrity_ok: boolean; readonly foreign_keys_ok: boolean; readonly links_ok: boolean; readonly text_ok: boolean } | null
}

export interface RelocateReport {
  readonly opencode_db: string
  readonly context_db: string | null
  readonly dry_run: boolean
  /** The folder moves, renamed folders included. */
  readonly rules: readonly MapRule[]
  /** The renamed folders, whose old names were replaced as whole names. */
  readonly renames: readonly NameRename[]
  readonly sessions: readonly RelocatedSession[]
  readonly skipped: readonly RelocateSkip[]
  /** OpenCode projects the moved sessions now belong to that the store did not have yet. */
  readonly projects_created: readonly string[]
  readonly text: TextRewriteCounts
  readonly context_text: ContextTextRewriteCounts | null
  /** Each old Magic Context project's state merged into the project its sessions moved to. */
  readonly projects_merged: readonly ProjectMergeResult[]
  readonly checks: RelocateChecks
  /** The checks that failed (a run refuses when there is one; a dry run reports them). */
  readonly failed: readonly string[]
  readonly backup_dir: string | null
  readonly rollback: string | null
  readonly stale_locks_cleared: readonly StaleLock[]
}

function total(counts: Readonly<Record<string, number>>): number {
  return Object.values(counts).reduce((sum, value) => sum + value, 0)
}

/** The report in a few lines. */
export function relocateLines(report: RelocateReport): string[] {
  const roots = new Set(report.sessions.map((session) => session.root)).size
  const lines = [
    `${report.dry_run ? "Dry run" : "Relocated"}: ${report.sessions.length} sessions (${roots} root sessions with their sub-agent sessions) → ${report.opencode_db}`,
    `Text: ${total(report.text.rows)} OpenCode rows rewritten${report.context_text === null ? "" : `, ${total(report.context_text.rows)} Magic Context rows`}`,
  ]
  if (report.renames.length > 0) lines.push(`Renamed: ${report.renames.map((rename) => `${rename.from} → ${rename.to}`).join(", ")}`)
  if (report.projects_merged.length > 0)
    lines.push(`Magic Context projects merged: ${report.projects_merged.map((merge) => `${merge.from} → ${merge.to} (${merge.memories_copied} memories)`).join(", ")}`)
  if (report.skipped.length > 0) lines.push(`Skipped: ${report.skipped.map((skip) => `${skip.id} (${skip.reason})`).join(", ")}`)
  if (report.failed.length > 0) lines.push(`Failed checks: ${report.failed.join(", ")}`)
  lines.push(report.rollback === null ? "The stores were not changed." : `Originals kept; undo: ${report.rollback}`)
  return lines
}
