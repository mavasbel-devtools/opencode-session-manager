/** The running OpenCode server. */
export interface ServicePort {
  /** When the newest running `opencode … serve` process started (ms since the epoch), or null if none runs. */
  startedAt(): Promise<number | null>
}
