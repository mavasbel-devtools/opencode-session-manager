import type { SESSION_ID_TOOL } from "@session-id/domain/tool/SessionIdToolDefinition"
import type { ToolExecutionContext, ToolResult } from "@session-id/domain/ports/inbound/ResolveSessionIdToolPort"

export interface V2ToolInfo {
  readonly name: string
  readonly description: string
  readonly input: typeof SESSION_ID_TOOL.input
  readonly options: typeof SESSION_ID_TOOL.options
  execute(input: unknown, context: ToolExecutionContext | undefined): Promise<ToolResult>
}

export interface V2ToolEditor {
  add(tool: V2ToolInfo): void
}

/**
 * The slice of the OpenCode 2 server plugin context (`@opencode/plugin`
 * `ToolDomain.transform`, dist/promise/tool.d.ts in v2.0.14) this plugin uses,
 * declared structurally so the bundle carries no `@opencode/*` runtime import.
 */
export interface V2ServerContext {
  readonly tool: {
    transform(callback: (editor: V2ToolEditor) => void): Promise<unknown>
  }
}
