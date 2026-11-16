import type { WorktreeLinkOutcome } from "@session-manager/domain/model/GitWorktree"
import type { Relocation } from "@session-manager/domain/model/PathMapping"

/** Inbound port: proves and repairs the Git work tree links of a folder sessions are moving to. */
export interface RepairWorktreeLinksPort {
  /** Repairs only what `rules` prove; `dryRun` plans without running Git's repair. */
  ensure(directory: string, rules: readonly Relocation[], dryRun?: boolean): WorktreeLinkOutcome
}
