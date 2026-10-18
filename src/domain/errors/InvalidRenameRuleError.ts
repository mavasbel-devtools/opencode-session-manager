/** A `--rename <folder>=<name>` rule relocate cannot apply. */
export class InvalidRenameRuleError extends Error {
  readonly _tag = "InvalidRenameRuleError"
  constructor(
    public readonly rule: string,
    public readonly reason: string,
  ) {
    super(`--rename ${rule}: ${reason}`)
    this.name = "InvalidRenameRuleError"
  }
}
