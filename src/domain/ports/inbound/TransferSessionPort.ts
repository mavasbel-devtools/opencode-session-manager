import type { TransferResult } from "@session-manager/domain/model/Session"

/** Inbound port: moves a session by writing the OpenCode 1 store (v1 lane). */
export interface TransferSessionPort {
  execute(sessionId: string, targetDirectory: string): Promise<TransferResult>
}
