export class SessionNotFoundError extends Error {
  readonly _tag = "SessionNotFoundError"
  constructor(public readonly sessionId: string) {
    super(`Session not found: ${sessionId}`)
    this.name = "SessionNotFoundError"
  }
}

export class InvalidDirectoryError extends Error {
  readonly _tag = "InvalidDirectoryError"
  constructor(public readonly directory: string, public readonly reason: string) {
    super(`Invalid directory "${directory}": ${reason}`)
    this.name = "InvalidDirectoryError"
  }
}

export class DatabaseError extends Error {
  readonly _tag = "DatabaseError"
  constructor(message: string, public override readonly cause?: unknown) {
    super(message)
    this.name = "DatabaseError"
  }
}
