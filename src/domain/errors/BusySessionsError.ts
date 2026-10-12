/** `--strict`: Magic Context is working on sessions the sync was asked for, so the whole sync is refused. */
export class BusySessionsError extends Error {
  readonly _tag = "BusySessionsError"

  constructor(readonly sessions: readonly string[]) {
    super(
      `--strict: Magic Context is working on ${sessions.join(", ")} (a wrapup, or a summary run holding its lease); nothing was written. Wait for it to finish, or sync without --strict to skip ${sessions.length === 1 ? "it" : "them"}`,
    )
    this.name = "BusySessionsError"
  }
}
