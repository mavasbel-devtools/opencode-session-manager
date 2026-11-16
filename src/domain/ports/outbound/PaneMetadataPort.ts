import type { PanePresentation } from "@session-manager/domain/model/PaneTitle"

/**
 * Outbound (driven) port: what the terminal multiplexer shows for this pane.
 * Each call answers whether the multiplexer accepted the report, and never
 * rejects: a multiplexer that is gone or silent answers `false`.
 */
export interface PaneMetadataPort {
  /**
   * Shows `agent` as the pane's agent name and `title` as its title. A value
   * that is `undefined` is left out, so the multiplexer shows its default for it.
   */
  show(presentation: PanePresentation): Promise<boolean>
  /** Hands the pane's title and agent name back to the multiplexer's defaults. */
  clear(): Promise<boolean>
}
