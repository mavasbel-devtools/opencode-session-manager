import type { SessionSummary } from "@transfer/domain/entities"
import type { SessionHostPort } from "@transfer/domain/ports"

/**
 * The slice of the OpenCode 2 client (`@opencode/client`, handed to TUI
 * plugins as `context.client`) this adapter uses. Declared structurally so the
 * plugin does not depend on the unpublished `@opencode/*` workspace packages.
 * Shapes verified against packages/client/src/promise/generated/{client,types}.ts
 * (v2.0.14): `session.list` → `GET /api/session` returning `{ data, cursor }`,
 * `session.move` → `POST /api/session/:id/move`, `project.list` →
 * `GET /api/project` returning `Project[]`.
 */
export interface OpenCode2Client {
  readonly session: {
    list(input?: { readonly limit?: number; readonly order?: "asc" | "desc" }): Promise<{
      readonly data: ReadonlyArray<OpenCode2Session>
    }>
    move(input: { readonly sessionID: string; readonly directory: string }): Promise<unknown>
  }
  readonly project: {
    list(): Promise<ReadonlyArray<OpenCode2Project>>
  }
}

export interface OpenCode2Session {
  readonly id: string
  readonly parentID?: string
  readonly projectID: string
  readonly title?: string
  readonly subpath?: string
  readonly time: { readonly updated: number }
  readonly location: { readonly directory: string }
}

export interface OpenCode2Project {
  readonly id: string
  readonly canonical: string
  readonly sandboxes: ReadonlyArray<string>
}

/** Newest root sessions considered for the session picker and known directories. */
export const SESSION_LIMIT = 200

export class OpenCode2HostAdapter implements SessionHostPort {
  constructor(private readonly client: OpenCode2Client) {}

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
