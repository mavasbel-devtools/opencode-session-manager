import type { MoveResult } from "@session-manager/domain/model/Session"

/** Inbound port: moves a session through the OpenCode 2 host API (v2 lane). */
export interface MoveSessionPort {
  execute(sessionId: string, targetDirectory: string): Promise<MoveResult>
}
