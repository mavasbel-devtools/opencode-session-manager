import type { GitWorkTree, RegisteredWorktree, WorktreeRepairPlan } from "@session-manager/domain/model/GitWorktree"
import type { Relocation } from "@session-manager/domain/model/PathMapping"
import { relocatedFolder } from "@session-manager/domain/services/RelocateRules"

/** What the planner may ask about the disk. */
export interface WorktreeProbe {
  isDirectory(path: string): boolean
  /** The administrative folder a folder's `.git` file names; null when it has none. */
  gitFile(folder: string): string | null
}

const NONE: WorktreeRepairPlan = { kind: "none" }
const UNPROVEN: WorktreeRepairPlan = { kind: "unproven" }

function repair(cwd: string, paths: readonly string[]): WorktreeRepairPlan {
  return { kind: "repair", command: { cwd, paths } }
}

/** Whether `actual` is `expected`, or an old path an explicit rule maps onto it. */
function provenAs(rules: readonly Relocation[], actual: string, expected: string): boolean {
  return actual === expected || relocatedFolder(rules, actual) === expected
}

/** The main work tree (or bare repository) of `<common dir>/worktrees/<id>`; null for any other folder. */
export function mainOfAdmin(admin: string): string | null {
  const parts = admin.replace(/\/+$/, "").split("/")
  if (parts.length < 4 || parts.at(-2) !== "worktrees") return null
  const common = parts.slice(0, -2)
  return (common.at(-1) === ".git" ? common.slice(0, -1) : common).join("/") || "/"
}

/**
 * The one `git worktree repair` that explicit mappings prove for a work tree, without guessing:
 *
 * - a linked work tree whose administrative folder is gone, but maps to an existing one → repair
 *   from that folder's main work tree, naming this one (the main work tree moved);
 * - a linked work tree whose administrative folder records a missing old path that maps here →
 *   repair inside this work tree (this work tree moved);
 * - a main work tree whose registered work tree is missing but maps to an existing folder whose
 *   `.git` names the same administrative folder (or its mapped old path) → repair naming it;
 * - a main work tree whose existing registered work tree names a missing administrative folder
 *   that maps onto the registered one → repair from the main work tree (it moved).
 *
 * Every other disagreement is `unproven` (a link this run cannot explain) and nothing runs.
 */
export function worktreeRepairPlan(tree: GitWorkTree, rules: readonly Relocation[], probe: WorktreeProbe): WorktreeRepairPlan {
  if (tree.kind === "linked") return linkedPlan(tree, rules, probe)
  const paths: string[] = []
  let stale = false
  let unproven = false
  for (const worktree of tree.worktrees) {
    const verdict = registeredVerdict(worktree, rules, probe)
    if (verdict === "stale") stale = true
    else if (verdict === "unproven") unproven = true
    else if (verdict !== "fine") paths.push(verdict.path)
  }
  if (paths.length > 0 || stale) return repair(tree.root, paths)
  return unproven ? UNPROVEN : NONE
}

function linkedPlan(tree: GitWorkTree, rules: readonly Relocation[], probe: WorktreeProbe): WorktreeRepairPlan {
  if (tree.admin === null) return UNPROVEN
  if (probe.isDirectory(tree.admin)) {
    if (tree.recorded === tree.root) return NONE
    if (tree.recorded !== null && !probe.isDirectory(tree.recorded) && relocatedFolder(rules, tree.recorded) === tree.root) return repair(tree.root, [])
    return UNPROVEN
  }
  const moved = relocatedFolder(rules, tree.admin)
  const main = moved === null ? null : mainOfAdmin(moved)
  if (moved === null || main === null || !probe.isDirectory(moved)) return UNPROVEN
  return repair(main, [tree.root])
}

/**
 * A registered work tree: fine (linked back, or gone with no mapping naming it — Git's own
 * `prune` business), stale (its main moved), moved to a proven path, or unexplained.
 */
function registeredVerdict(
  worktree: RegisteredWorktree,
  rules: readonly Relocation[],
  probe: WorktreeProbe,
): "fine" | "stale" | "unproven" | { readonly path: string } {
  if (worktree.recorded === null) return "fine"
  if (probe.isDirectory(worktree.recorded)) {
    if (worktree.points === worktree.admin) return "fine"
    if (worktree.points !== null && !probe.isDirectory(worktree.points) && relocatedFolder(rules, worktree.points) === worktree.admin) return "stale"
    return "unproven"
  }
  const moved = relocatedFolder(rules, worktree.recorded)
  if (moved === null) return "fine"
  if (!probe.isDirectory(moved)) return "unproven"
  const points = probe.gitFile(moved)
  return points !== null && provenAs(rules, points, worktree.admin) ? { path: moved } : "unproven"
}
