import type { SessionSummary } from "@session-manager/domain/model/Session"
import type { KnownDirectoriesPort } from "@session-manager/domain/ports/outbound/KnownDirectoriesPort"

/** Outbound port: the OpenCode 1 session store, written directly (v1 lane only). */
export interface SessionDbPort extends KnownDirectoriesPort {
  getSession(sessionId: string): Promise<SessionSummary | null>
  listSessions(): Promise<SessionSummary[]>
  updateSessionLocation(sessionId: string, newDirectory: string, newProjectId: string, newPath: string): Promise<void>
  upsertProject(projectId: string, worktree: string): Promise<void>
}
