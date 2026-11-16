import type { PanePresentation } from "@session-manager/domain/model/PaneTitle"

/**
 * Inbound (driving) port: keeps the pane showing the agent of the open session
 * and the title of its root session.
 * Rejects only when the outbound port breaks its never-reject contract.
 */
export interface ReportPaneTitlePort {
  /** The open session's agent and its root's title, as read; `undefined` when no session is open. */
  report(presentation: PanePresentation | undefined): Promise<void>
  /** Sends the current presentation again on the next report, even when it has not changed. */
  refresh(): void
  /** Gives the pane back its defaults if anything is shown. */
  release(): Promise<void>
}
