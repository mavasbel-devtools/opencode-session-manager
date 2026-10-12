/** The relocated copies failed a check, so the profile's stores were left untouched. */
export class RelocateVerificationError extends Error {
  readonly _tag = "RelocateVerificationError"

  constructor(readonly failed: readonly string[]) {
    super(`the relocated copies failed ${failed.join(", ")}; the profile's stores were left untouched`)
    this.name = "RelocateVerificationError"
  }
}
