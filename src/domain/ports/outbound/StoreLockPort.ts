import type { LockOwner, StaleLock } from "@session-manager/domain/model/StoreLock"

/** The locks taken on a set of stores, until `release`. */
export interface StoreLockHandle {
  /** Locks left by processes that no longer exist, removed before these were taken. */
  readonly cleared: readonly StaleLock[]
  release(): void
}

/**
 * One writer per store at a time, among opencode-session-manager processes. Taking the locks of
 * several stores is all or nothing: when one is held by a live process, the ones already taken are
 * released and `StoreLockedError` is thrown.
 */
export interface StoreLockPort {
  acquire(stores: readonly string[], owner: LockOwner): StoreLockHandle
}
