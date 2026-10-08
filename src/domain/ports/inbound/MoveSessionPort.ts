import type { MoveResult } from "@session-manager/domain/model/Session"

/** Inbound port: moves a session through the OpenCode 2 host API (v2 lane). */
export interface MoveSessionPort {
  /** `targetDirectory` is user input: trimmed, `~`-expanded and made absolute against `home`. */
  execute(sessionId: string, targetDirectory: string, home: string): Promise<MoveResult>
}
