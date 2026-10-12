import type { LockOwner } from "@session-manager/domain/model/StoreLock"

/** Another opencode-session-manager is writing the store; nothing was changed. */
export class StoreLockedError extends Error {
  readonly _tag = "StoreLockedError"

  /** `owner` is null when the lock file cannot be read (another process is writing it, or it is damaged). */
  constructor(store: string, lockFile: string, owner: LockOwner | null) {
    const who = owner === null ? "an unreadable lock" : `pid ${owner.pid}, ${owner.command}, since ${owner.since}`
    super(`${store} is being written by another opencode-session-manager (${who}); wait for it to finish, or remove ${lockFile} if no such process runs`)
    this.name = "StoreLockedError"
  }
}
