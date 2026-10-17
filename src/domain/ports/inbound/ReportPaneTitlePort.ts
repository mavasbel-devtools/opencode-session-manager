/**
 * Inbound (driving) port: keeps the pane's title on the open session's title.
 * Rejects only when the outbound port breaks its never-reject contract.
 */
export interface ReportPaneTitlePort {
  /** The open session's title, or `undefined` when no session is open (or it has no title). */
  report(title: string | undefined): Promise<void>
  /** Sends the current title again on the next report, even when it has not changed. */
  refresh(): void
  /** Gives the pane back its defaults if a title is shown. */
  release(): Promise<void>
}
