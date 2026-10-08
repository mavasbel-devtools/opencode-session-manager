import type { SessionSummary } from "@session-manager/domain/model/Session"
import type { SessionHostPort } from "@session-manager/domain/ports/outbound/SessionHostPort"
import type { V2Client } from "@session-manager/infrastructure/host/V2Client"

/** Newest root sessions considered for the session picker and known directories. */
export const SESSION_LIMIT = 200

export class OpenCode2HostAdapter implements SessionHostPort {
  constructor(private readonly client: V2Client) {}

  async listSessions(): Promise<SessionSummary[]> {
    const response = await this.client.session.list({ limit: SESSION_LIMIT, order: "desc" })
    return response.data
      .filter((session) => !session.parentID)
      .map((session) => ({
        id: session.id,
        title: session.title ?? "",
        directory: session.location.directory,
        projectId: session.projectID,
        path: session.subpath ?? "",
        timeUpdated: session.time.updated,
      }))
  }

  /**
   * Every registered project root and worktree (sandbox), plus every directory
   * a session currently lives in — across all projects. This is what the
   * builtin v2 workspace picker lacks: it only lists the current project.
   */
  async listRecentDirectories(): Promise<string[]> {
    const [projects, sessions] = await Promise.all([this.client.project.list(), this.listSessions()])
    return [
      ...projects.flatMap((project) => [project.canonical, ...project.sandboxes]),
      ...sessions.map((session) => session.directory),
    ]
  }

  async moveSession(sessionId: string, directory: string): Promise<void> {
    await this.client.session.move({ sessionID: sessionId, directory })
  }
}
