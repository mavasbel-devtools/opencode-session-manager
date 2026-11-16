import type { GitWorkTree } from "@session-manager/domain/model/GitWorktree"

/** Outbound port: the Git work tree links of a folder, and Git's own repair of them. */
export interface GitWorktreePort {
  /** The work tree holding the folder (the nearest `.git` at or above it); null outside Git or when it is missing. */
  locate(directory: string): GitWorkTree | null
  /** The administrative folder a folder's `.git` file names; null when it has none. */
  gitFile(folder: string): string | null
  /** Runs `git worktree repair <paths…>` in `cwd`; false when Git refuses. */
  repair(cwd: string, paths: readonly string[]): boolean
  /** True when Git resolves `directory` to the work tree `root` with an existing common folder. */
  resolves(directory: string, root: string): boolean
}
