import type { DirectoryOption, MoveResult, SessionSummary, TransferResult } from "@transfer/domain/entities"

/** Source of the directories offered by the transfer picker. */
export interface KnownDirectoriesPort {
  listRecentDirectories(): Promise<string[]>
}

export interface SessionDbPort extends KnownDirectoriesPort {
  getSession(sessionId: string): Promise<SessionSummary | null>
  listSessions(): Promise<SessionSummary[]>
  updateSessionLocation(
    sessionId: string,
    newDirectory: string,
    newProjectId: string,
    newPath: string,
  ): Promise<void>
  upsertProject(projectId: string, worktree: string): Promise<void>
}

export interface ProjectResolverPort {
  resolve(directory: string): Promise<{
    projectId: string
    worktree: string
    relativePath: string
  }>
}

export interface FileSystemPort {
  /** Create the directory (and parents) when missing. */
  ensureDirectory(directory: string): void
  /** Resolve to the exact on-disk casing when the directory exists. */
  canonical(directory: string, home: string): string
  /** Subdirectories of the directory implied by `input`, alphabetical. */
  autocomplete(input: string, home: string, limit?: number): string[]
}

export interface TransferSessionPort {
  execute(sessionId: string, targetDirectory: string): Promise<TransferResult>
}

export interface ListRecentDirectoriesPort {
  execute(): Promise<string[]>
}

export interface BuildDirectoryOptionsPort {
  execute(home: string): Promise<DirectoryOption[]>
}

/**
 * OpenCode 2 host API. The v2 server owns the session row and project
 * resolution (event-sourced), so a move is an API request, never a direct
 * database write.
 */
export interface SessionHostPort extends KnownDirectoriesPort {
  listSessions(): Promise<SessionSummary[]>
  moveSession(sessionId: string, directory: string): Promise<void>
}

export interface MoveSessionPort {
  execute(sessionId: string, targetDirectory: string): Promise<MoveResult>
}
