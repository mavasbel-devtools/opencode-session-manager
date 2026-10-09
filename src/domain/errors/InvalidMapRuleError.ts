/** A `--map <from>=<to>` rule the sync cannot apply. */
export class InvalidMapRuleError extends Error {
  readonly _tag = "InvalidMapRuleError"
  constructor(
    public readonly rule: string,
    public readonly reason: string,
  ) {
    super(`--map ${rule}: ${reason}`)
    this.name = "InvalidMapRuleError"
  }
}
