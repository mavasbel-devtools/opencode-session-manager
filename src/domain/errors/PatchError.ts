export type PatchErrorCode = "count-mismatch" | "usage" | "not-installed"

/** A refusal the tool reports instead of changing anything. */
export class PatchError extends Error {
  constructor(
    readonly code: PatchErrorCode,
    message: string,
  ) {
    super(message)
    this.name = "PatchError"
  }
}
