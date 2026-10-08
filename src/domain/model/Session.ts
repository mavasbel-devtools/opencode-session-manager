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

export interface TransferResult {
  readonly sessionId: string
  readonly previousDirectory: string
  readonly newDirectory: string
  readonly newProjectId: string
  readonly newRelativePath: string
}

export interface MoveResult {
  readonly sessionId: string
  readonly newDirectory: string
}

export interface DirectoryOption {
  readonly title: string
  readonly directory: string
  readonly description?: string
  readonly category: string
  /** Marks the sentinel entry that opens the free-form path prompt. */
  readonly custom?: boolean
}
