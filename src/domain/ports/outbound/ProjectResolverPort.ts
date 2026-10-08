/** A directory resolved the way the OpenCode 1 host resolves it to a project. */
export interface ResolvedProject {
  readonly projectId: string
  readonly worktree: string
  readonly relativePath: string
}

/** Outbound port: directory → project (v1 lane only; the v2 host resolves its own). */
export interface ProjectResolverPort {
  resolve(directory: string): Promise<ResolvedProject>
}
