export class SyncVerificationError extends Error {
  /** The synced copy failed a check, so the target was left untouched. */
  constructor(failed: readonly string[]) {
    super(`the synced copy failed ${failed.join(", ")}; the target store was left untouched`)
    this.name = "SyncVerificationError"
  }
}
