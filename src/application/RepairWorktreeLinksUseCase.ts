import type { WorktreeLinkOutcome, WorktreeLinkStatus, WorktreeRepairCommand } from "@session-manager/domain/model/GitWorktree"
import type { Relocation } from "@session-manager/domain/model/PathMapping"
import type { RepairWorktreeLinksPort } from "@session-manager/domain/ports/inbound/RepairWorktreeLinksPort"
import type { FileSystemPort } from "@session-manager/domain/ports/outbound/FileSystemPort"
import type { GitWorktreePort } from "@session-manager/domain/ports/outbound/GitWorktreePort"
import { worktreeRepairPlan, type WorktreeProbe } from "@session-manager/domain/services/WorktreeRepairPlanner"

/**
 * Runs Git's own `git worktree repair` only when an explicit mapping proves it (see
 * `worktreeRepairPlan`), then asks Git again: the outcome is what Git resolves afterwards, never
 * what the repair claimed.
 */
export class RepairWorktreeLinksUseCase implements RepairWorktreeLinksPort {
  private readonly probe: WorktreeProbe

  constructor(
    private readonly git: GitWorktreePort,
    files: FileSystemPort,
  ) {
    this.probe = { isDirectory: (path) => files.isDirectory(path), gitFile: (folder) => git.gitFile(folder) }
  }

  ensure(directory: string, rules: readonly Relocation[], dryRun = false): WorktreeLinkOutcome {
    const tree = this.git.locate(directory)
    if (tree === null) return outcome(directory, null, "none", null)
    const plan = worktreeRepairPlan(tree, rules, this.probe)
    if (plan.kind !== "repair") {
      if (!this.git.resolves(directory, tree.root)) return outcome(directory, tree.root, "unresolved", null)
      return outcome(directory, tree.root, plan.kind === "none" ? "healthy" : "unproven", null)
    }
    if (dryRun) return outcome(directory, tree.root, "would-repair", plan.command)
    // Git's exit status is not trusted either way: only the state afterwards decides.
    this.git.repair(plan.command.cwd, plan.command.paths)
    const after = this.git.locate(directory)
    if (after === null || !this.git.resolves(directory, after.root)) return outcome(directory, tree.root, "unresolved", plan.command)
    return outcome(directory, after.root, worktreeRepairPlan(after, rules, this.probe).kind === "repair" ? "incomplete" : "repaired", plan.command)
  }
}

function outcome(directory: string, root: string | null, status: WorktreeLinkStatus, command: WorktreeRepairCommand | null): WorktreeLinkOutcome {
  return { directory, root, status, command }
}
