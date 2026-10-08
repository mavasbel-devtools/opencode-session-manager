export class DatabaseError extends Error {
  readonly _tag = "DatabaseError"
  constructor(
    message: string,
    public override readonly cause?: unknown,
  ) {
    super(message)
    this.name = "DatabaseError"
  }
}
