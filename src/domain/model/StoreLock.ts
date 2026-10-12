/**
 * Who holds a store's lock: written into `<store>.session-manager.lock` by the process that is
 * about to write the store (a sync, a Magic Context sync, a rollback, a compaction run).
 */
export interface LockOwner {
  readonly pid: number
  /** What the owner is doing, for the refusal message: `sync`, `context sync`, `rollback`, `run`. */
  readonly command: string
  /** ISO time the lock was taken. */
  readonly since: string
}

/** A lock left behind by a process that no longer exists, removed before taking it. */
export interface StaleLock {
  readonly file: string
  readonly pid: number
  readonly command: string
  readonly since: string
}

export const LOCK_SUFFIX = ".session-manager.lock"

/** The lock file of a store. */
export function lockFileOf(store: string): string {
  return `${store}${LOCK_SUFFIX}`
}
