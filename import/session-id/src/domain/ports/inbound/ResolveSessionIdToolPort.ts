/** What the host passes to a tool call; only the session ID is of interest here. */
export interface ToolExecutionContext {
  readonly sessionID?: unknown
}

export interface ToolResult {
  readonly content: string
}

/** Inbound (driving) port: answers a `session-id` tool call. */
export interface ResolveSessionIdToolPort {
  execute(context: ToolExecutionContext | undefined): ToolResult
}
