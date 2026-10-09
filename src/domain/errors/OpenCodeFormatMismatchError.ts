/** Two OpenCode stores exchange rows only when the same OpenCode migrations were applied to both. */
export class OpenCodeFormatMismatchError extends Error {
  readonly _tag = "OpenCodeFormatMismatchError"
  constructor(
    public readonly source: string,
    public readonly sourceFormat: string,
    public readonly target: string,
    public readonly targetFormat: string,
  ) {
    super(
      `${source} is at OpenCode migration ${sourceFormat} and ${target} at ${targetFormat}: start the same OpenCode version on both once (it migrates its store), then sync again`,
    )
    this.name = "OpenCodeFormatMismatchError"
  }
}
