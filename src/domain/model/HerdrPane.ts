/** The Herdr pane a process runs in, as Herdr hands it to every process it starts in a pane. */
export interface HerdrPane {
  /** `HERDR_SOCKET_PATH`: the session's API socket (on Windows, the pipe name). */
  readonly socketPath: string
  /** `HERDR_PANE_ID`: the pane, e.g. `w1:p1`. */
  readonly paneID: string
}

/**
 * The pane from the process environment, the way Herdr's own OpenCode
 * integration reads it: `HERDR_ENV=1` plus a socket and a pane. `undefined`
 * outside Herdr, where the pane title has nothing to report to.
 */
export function herdrPane(environment: Readonly<Record<string, string | undefined>>): HerdrPane | undefined {
  const socketPath = environment["HERDR_SOCKET_PATH"]
  const paneID = environment["HERDR_PANE_ID"]
  if (environment["HERDR_ENV"] !== "1" || !socketPath || !paneID) return undefined
  return { socketPath, paneID }
}
