export interface SessionSummary {
  readonly id: string
  readonly title: string
  readonly directory: string
  readonly projectId: string
  readonly path: string
  readonly timeUpdated: number
}

export interface ProjectRecord {
  readonly id: string
  readonly worktree: string
}

export interface MoveResult {
  readonly sessionId: string
  readonly newDirectory: string
}

export interface DirectoryOption {
  readonly title: string
  readonly directory: string
  readonly category: string
}
