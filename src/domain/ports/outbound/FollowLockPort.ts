/** A lock held by one `follow` run at a time. */
export interface FollowLockPort {
  /** Takes the lock and returns its release, or `null` when a live process holds it. */
  acquire(): Promise<(() => Promise<void>) | null>
}
