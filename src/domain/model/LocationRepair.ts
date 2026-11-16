import type { WorktreeLinkOutcome } from "@session-manager/domain/model/GitWorktree"
import type { MapRule } from "@session-manager/domain/model/SessionSync"

/** One session whose missing recorded folder has one proven replacement. */
export interface LocationRepair {
  readonly session_id: string
  readonly from_directory: string
  readonly to_directory: string
}

/**
 * Why a session was deliberately left untouched by an online location repair:
 * its folder still exists, no mapping names it, the mapped folder is missing, or Git cannot
 * resolve the mapped folder's work tree.
 */
export type LocationRepairSkipReason = "directory-present" | "not-mapped" | "target-missing" | "worktree-unresolved"

export interface LocationRepairSkip {
  readonly session_id: string
  readonly directory: string
  readonly reason: LocationRepairSkipReason
  readonly to_directory: string | null
}

/** Result of an online repair. Session moves are always delegated to OpenCode. */
export interface LocationRepairReport {
  readonly rules: readonly MapRule[]
  readonly repaired: readonly LocationRepair[]
  readonly skipped: readonly LocationRepairSkip[]
  /** Git work trees of mapped folders that were repaired, would need one, or disagree. */
  readonly worktrees: readonly WorktreeLinkOutcome[]
  /** Another process held the repair lock; nothing was inspected or changed. */
  readonly busy: boolean
}

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`
}

/** The report in one sentence for a person; null when nothing is configured. */
export function locationRepairMessage(report: LocationRepairReport): string | null {
  if (report.rules.length === 0) return null
  if (report.busy) return "Another OpenCode window is repairing session locations; nothing was changed."
  const parts = [
    report.repaired.length > 0
      ? `Repaired ${plural(report.repaired.length, "session location")}.`
      : "No stale mapped session locations needed repair.",
  ]
  const repairedTrees = report.worktrees.filter((tree) => tree.status === "repaired").length
  if (repairedTrees > 0) parts.push(`Repaired Git links of ${plural(repairedTrees, "work tree")}.`)
  const count = (reason: LocationRepairSkipReason) => report.skipped.filter((skip) => skip.reason === reason).length
  if (count("target-missing") > 0) parts.push(`${plural(count("target-missing"), "mapped folder")} missing.`)
  if (count("worktree-unresolved") > 0) parts.push(`${plural(count("worktree-unresolved"), "session")} left: Git cannot resolve the mapped work tree.`)
  const disagreeing = report.worktrees.filter((tree) => tree.status === "unproven" || tree.status === "incomplete").length
  if (disagreeing > 0) parts.push(`${plural(disagreeing, "work tree")} with Git links no mapping explains.`)
  return parts.join(" ")
}

/** Whether the report needs a person's attention (a session or work tree was left). */
export function locationRepairNeedsAttention(report: LocationRepairReport): boolean {
  return (
    report.skipped.some((skip) => skip.reason === "target-missing" || skip.reason === "worktree-unresolved") ||
    report.worktrees.some((tree) => tree.status === "unproven" || tree.status === "incomplete" || tree.status === "unresolved")
  )
}
