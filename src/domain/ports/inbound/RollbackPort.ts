import type { StaleLock } from "@session-manager/domain/model/StoreLock"

export interface RollbackInput {
  readonly dbPath: string
  readonly backupDir: string
  readonly image: string
  /**
   * The stores the running OpenCode uses (its data home's): restoring one of them is refused while
   * OpenCode runs at all. Any other store is refused only while it is held open. Not given: every store.
   */
  readonly liveStores?: readonly string[]
}

export interface RollbackOutcome {
  readonly restored: readonly string[]
  /** Where the compacted files that were in place got parked. */
  readonly parked: string
  /** Locks left by processes that no longer exist, removed before restoring. */
  readonly staleLocksCleared: readonly StaleLock[]
}

export interface RollbackPort {
  execute(input: RollbackInput): RollbackOutcome
  /** Restores several databases from one backup folder; refuses before restoring any when one has no original there. */
  executeAll(input: Omit<RollbackInput, "dbPath"> & { readonly dbPaths: readonly string[] }): readonly RollbackOutcome[]
}
