import type { ResolveSessionIdToolPort } from "@session-manager/domain/ports/inbound/ResolveSessionIdToolPort"
import { SESSION_ID_TOOL } from "@session-manager/domain/tool/SessionIdToolDefinition"
import type { V2ServerContext } from "@session-manager/infrastructure/host/V2ServerContext"

/** OpenCode 2 inbound adapter that registers the `session-id` tool. */
export class SessionIdToolV2Adapter {
  constructor(private readonly tool: ResolveSessionIdToolPort) {}

  async register(context: V2ServerContext): Promise<void> {
    await context.tool.transform((editor) => {
      editor.add({
        name: SESSION_ID_TOOL.name,
        description: SESSION_ID_TOOL.description,
        // Fresh copies, as the replaced tool built fresh literals: the host may normalise what it receives.
        input: structuredClone(SESSION_ID_TOOL.input),
        options: structuredClone(SESSION_ID_TOOL.options),
        execute: async (_input, toolContext) => this.tool.execute(toolContext),
      })
    })
  }
}
