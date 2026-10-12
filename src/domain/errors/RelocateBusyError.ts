/** Magic Context is working on sessions a relocation would move, so nothing is moved. */
export class RelocateBusyError extends Error {
  readonly _tag = "RelocateBusyError"

  constructor(readonly sessions: readonly string[]) {
    super(`Magic Context is working on ${sessions.join(", ")} (a wrapup, or a summary run holding its lease); nothing was moved. Wait for it to finish, then relocate again`)
    this.name = "RelocateBusyError"
  }
}
