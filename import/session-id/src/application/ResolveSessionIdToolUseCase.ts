import { requireSessionId } from "@session-id/domain/model/SessionId"
import type {
  ResolveSessionIdToolPort,
  ToolExecutionContext,
  ToolResult,
} from "@session-id/domain/ports/inbound/ResolveSessionIdToolPort"

export class ResolveSessionIdToolUseCase implements ResolveSessionIdToolPort {
  constructor() {}

  execute(context: ToolExecutionContext | undefined): ToolResult {
    return { content: requireSessionId(context?.sessionID) }
  }
}
