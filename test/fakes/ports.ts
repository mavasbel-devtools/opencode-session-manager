import type { SessionSummary } from "@transfer/domain/entities"
import { expandHome } from "@transfer/domain/paths"
import type { SessionDbPort, ProjectResolverPort, FileSystemPort } from "@transfer/domain/ports"

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
  public defaultWorktree: string = "C:\\test\\repo"
  public defaultRelativePath: string = ""

  async resolve(_directory: string): Promise<{
    projectId: string
    worktree: string
    relativePath: string
  }> {
    return {
      projectId: this.defaultProjectId,
      worktree: this.defaultWorktree,
      relativePath: this.defaultRelativePath,
    }
  }
}

export class FakeFileSystemAdapter implements FileSystemPort {
  public ensured: string[] = []
  public autocompleteResult: string[] = []

  ensureDirectory(directory: string): void {
    this.ensured.push(directory)
  }

  canonical(directory: string, home: string): string {
    return expandHome(directory, home)
  }

  autocomplete(_input: string, _home: string, _limit?: number): string[] {
    return this.autocompleteResult
  }
}
