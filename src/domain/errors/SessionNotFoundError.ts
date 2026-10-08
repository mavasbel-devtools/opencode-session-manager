export class SessionNotFoundError extends Error {
  readonly _tag = "SessionNotFoundError"
  constructor(public readonly sessionId: string) {
    super(`Session not found: ${sessionId}`)
    this.name = "SessionNotFoundError"
  }
}
