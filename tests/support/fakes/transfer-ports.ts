import type { SessionSummary } from "@session-manager/domain/model/Session"
import { expandHome } from "@session-manager/domain/model/Paths"
import type { FileSystemPort } from "@session-manager/domain/ports/outbound/FileSystemPort"
import type { ProjectResolverPort, ResolvedProject } from "@session-manager/domain/ports/outbound/ProjectResolverPort"
import type { SessionDbPort } from "@session-manager/domain/ports/outbound/SessionDbPort"
import type { SessionHostPort } from "@session-manager/domain/ports/outbound/SessionHostPort"

export class FakeSessionDbAdapter implements SessionDbPort {
  public sessions: Map<string, SessionSummary> = new Map()
  public projects: Map<string, string> = new Map()

  async getSession(sessionId: string): Promise<SessionSummary | null> {
    return this.sessions.get(sessionId) ?? null
  }

  async listSessions(): Promise<SessionSummary[]> {
    return Array.from(this.sessions.values())
  }

  async listRecentDirectories(): Promise<string[]> {
    return Array.from(new Set(Array.from(this.sessions.values()).map((s) => s.directory)))
  }

  async updateSessionLocation(
    sessionId: string,
    newDirectory: string,
    newProjectId: string,
    newPath: string,
  ): Promise<void> {
    const s = this.sessions.get(sessionId)
    if (s) {
      this.sessions.set(sessionId, {
        ...s,
        directory: newDirectory,
        projectId: newProjectId,
        path: newPath,
        timeUpdated: Date.now(),
      })
    }
  }

  async upsertProject(projectId: string, worktree: string): Promise<void> {
    this.projects.set(projectId, worktree)
  }
}

export class FakeProjectResolverAdapter implements ProjectResolverPort {
  public defaultProjectId: string = "proj_test_123"
  public defaultWorktree: string = "/test/repo"
  public defaultRelativePath: string = ""

  async resolve(_directory: string): Promise<ResolvedProject> {
    return {
      projectId: this.defaultProjectId,
      worktree: this.defaultWorktree,
      relativePath: this.defaultRelativePath,
    }
  }
}

export class FakeFileSystemAdapter implements FileSystemPort {
  public ensured: string[] = []

  ensureDirectory(directory: string): void {
    this.ensured.push(directory)
  }

  canonical(directory: string, home: string): string {
    return expandHome(directory, home)
  }
}

export class FakeSessionHostAdapter implements SessionHostPort {
  public sessions: SessionSummary[] = []
  public directories: string[] = []
  public moves: Array<{ sessionId: string; directory: string }> = []
  public moveError: Error | undefined

  async listSessions(): Promise<SessionSummary[]> {
    return this.sessions
  }

  async listRecentDirectories(): Promise<string[]> {
    return this.directories
  }

  async moveSession(sessionId: string, directory: string): Promise<void> {
    if (this.moveError) throw this.moveError
    this.moves.push({ sessionId, directory })
  }
}
