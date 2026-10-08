export class InvalidDirectoryError extends Error {
  readonly _tag = "InvalidDirectoryError"
  constructor(
    public readonly directory: string,
    public readonly reason: string,
  ) {
    super(`Invalid directory "${directory}": ${reason}`)
    this.name = "InvalidDirectoryError"
  }
}
