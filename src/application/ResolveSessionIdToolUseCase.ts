import { requireSessionId } from "@session-manager/domain/model/SessionId"
import type {
  ResolveSessionIdToolPort,
  ToolExecutionContext,
  ToolResult,
} from "@session-manager/domain/ports/inbound/ResolveSessionIdToolPort"

export class ResolveSessionIdToolUseCase implements ResolveSessionIdToolPort {
  constructor() {}

  execute(context: ToolExecutionContext | undefined): ToolResult {
    return { content: requireSessionId(context?.sessionID) }
  }
}
