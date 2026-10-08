import type { TransferResult } from "@session-manager/domain/model/Session"

/** Inbound port: moves a session by writing the OpenCode 1 store (v1 lane). */
export interface TransferSessionPort {
  /** `targetDirectory` is user input: trimmed, `~`-expanded and made absolute against `home`. */
  execute(sessionId: string, targetDirectory: string, home: string): Promise<TransferResult>
}
