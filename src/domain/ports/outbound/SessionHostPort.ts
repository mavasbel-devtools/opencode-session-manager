import type { SessionSummary } from "@session-manager/domain/model/Session"
import type { KnownDirectoriesPort } from "@session-manager/domain/ports/outbound/KnownDirectoriesPort"

/**
 * Outbound port: the OpenCode 2 host API. The v2 server owns the session row and
 * project resolution (event-sourced), so a move is an API request, never a
 * direct database write.
 */
export interface SessionHostPort extends KnownDirectoriesPort {
  listSessions(): Promise<SessionSummary[]>
  moveSession(sessionId: string, directory: string): Promise<void>
}
