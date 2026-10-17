/**
 * Outbound (driven) port: what the terminal multiplexer shows for this pane.
 * Each call answers whether the multiplexer accepted the report, and never
 * rejects: a multiplexer that is gone or silent answers `false`.
 */
export interface PaneMetadataPort {
  /** Shows `title` as the pane's title and agent name. */
  show(title: string): Promise<boolean>
  /** Hands the pane's title and agent name back to the multiplexer's defaults. */
  clear(): Promise<boolean>
}
