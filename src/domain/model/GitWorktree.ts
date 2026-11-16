/** A linked work tree a main repository has registered under `<common dir>/worktrees/<id>`. */
export interface RegisteredWorktree {
  /** The administrative folder, `<common dir>/worktrees/<id>`. */
  readonly admin: string
  /** The work tree folder the administrative `gitdir` file records (without `/.git`); null when unreadable. */
  readonly recorded: string | null
  /** The administrative folder named by the recorded work tree's `.git` file; null when it has none. */
  readonly points: string | null
}

/** The Git work tree a folder belongs to, as its `.git` entries describe it. */
export interface GitWorkTree {
  /** The folder holding `.git`. */
  readonly root: string
  /** A main work tree holds a `.git` folder; a linked one a `.git` file naming its administrative folder. */
  readonly kind: "main" | "linked"
  /** Linked: the administrative folder its `.git` file names (null when unreadable). Main: null. */
  readonly admin: string | null
  /** Linked: the work tree folder that administrative folder records back (null when unreadable). Main: null. */
  readonly recorded: string | null
  /** Main: its registered linked work trees. Linked: none. */
  readonly worktrees: readonly RegisteredWorktree[]
}

/** One `git worktree repair`: run in `cwd`, naming `paths`. */
export interface WorktreeRepairCommand {
  readonly cwd: string
  readonly paths: readonly string[]
}

/**
 * What a repair needs: nothing; one `git worktree repair` an explicit mapping proves; or an
 * inconsistency no mapping explains, which is left alone.
 */
export type WorktreeRepairPlan =
  | { readonly kind: "none" }
  | { readonly kind: "repair"; readonly command: WorktreeRepairCommand }
  | { readonly kind: "unproven" }

/**
 * - `none`: not in a Git work tree.
 * - `healthy`: Git resolves it and its links agree.
 * - `repaired`: a proven `git worktree repair` ran and Git resolves it.
 * - `would-repair`: a dry run found a proven repair.
 * - `incomplete`: a proven repair ran and Git resolves the folder, but a link still disagrees.
 * - `unproven`: Git resolves the folder; a link disagrees with no mapping explaining it, so nothing ran.
 * - `unresolved`: Git cannot resolve the folder to its work tree; its sessions are not moved.
 */
export type WorktreeLinkStatus = "none" | "healthy" | "repaired" | "would-repair" | "incomplete" | "unproven" | "unresolved"

export interface WorktreeLinkOutcome {
  readonly directory: string
  /** The work tree root, or null outside Git. */
  readonly root: string | null
  readonly status: WorktreeLinkStatus
  /** The repair run (or, in a dry run, planned). */
  readonly command: WorktreeRepairCommand | null
}

/** Whether a folder's sessions may be moved there: everything but a work tree Git cannot resolve. */
export function worktreeAllowsMove(outcome: WorktreeLinkOutcome): boolean {
  return outcome.status !== "unresolved"
}

/** Whether the outcome is worth reporting (it changed, would change, or disagrees). */
export function worktreeNoteworthy(outcome: WorktreeLinkOutcome): boolean {
  return outcome.status !== "none" && outcome.status !== "healthy"
}
