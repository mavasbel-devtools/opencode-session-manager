/** How paths written on one machine map onto another, and the project OpenCode derives for a folder. */

/** A folder that moved: every path at or below `from` is rewritten to the same place below `to`. */
export interface Relocation {
  readonly from: string
  readonly to: string
}

/** How Windows paths map onto this machine. Only the Windows user's profile folder is rewritten. */
export interface PathMapping {
  /** The absolute POSIX home the profile maps to, without a trailing slash. */
  readonly home: string
  readonly windowsUser: string
  /** The drive letter the profile lives on, usually `C`. */
  readonly drive: string
  /** Applied after the profile mapping, in the order given. */
  readonly relocations: readonly Relocation[]
}

/** The project row every database has: folders OpenCode cannot place anywhere else. */
export const GLOBAL_PROJECT = "global"

/** The project OpenCode derives for a folder on this machine. */
export interface ProjectIdentity {
  readonly id: string
  readonly worktree: string
  readonly vcs: string | null
  /** The folder with every symlink resolved. */
  readonly real: string
}
