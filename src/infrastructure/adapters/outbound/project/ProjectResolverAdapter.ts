import fs from "node:fs"
import path from "node:path"
import type { ProjectResolverPort, ResolvedProject } from "@session-manager/domain/ports/outbound/ProjectResolverPort"
import type { OpenCodeGitIdentity } from "@session-manager/infrastructure/adapters/outbound/project/OpenCodeGitIdentity"

const GLOBAL = "global"

/**
 * Resolves a directory to a project exactly as the OpenCode 1.18.32 host does
 * (packages/core/src/project.ts `Project.resolve` and packages/core/src/git.ts
 * at tag v1.18.32), because the v1 lane writes the session row itself:
 *
 *   no `.git` above the directory → `global`, worktree `/`
 *   git repository → its id as OpenCode names it (`OpenCodeGitIdentity`: the `origin` remote,
 *                    the id cached in `<git-common-dir>/opencode`, the first sorted root commit)
 *                    ?? `global`
 */
export class ProjectResolverAdapter implements ProjectResolverPort {
  constructor(private readonly git: OpenCodeGitIdentity) {}

  async resolve(directory: string): Promise<ResolvedProject> {
    const resolved = path.resolve(directory)
    const markerFolder = this.discover(resolved)
    const repository = markerFolder === undefined ? undefined : this.git.repository(markerFolder, markerFolder)
    if (repository === undefined || repository.commonDirectory === null) {
      return { projectId: GLOBAL, worktree: "/", relativePath: this.relative(path.parse(resolved).root, resolved) }
    }
    const projectId = this.git.id(repository) ?? GLOBAL
    return { projectId, worktree: repository.worktree, relativePath: this.relative(repository.worktree, resolved) }
  }

  /** v1 `Git.repo.discover`: the nearest folder holding a `.git`, upwards. */
  private discover(start: string): string | undefined {
    let current = start
    while (!fs.existsSync(path.join(current, ".git"))) {
      const parent = path.dirname(current)
      if (parent === current) return undefined
      current = parent
    }
    return current
  }

  private relative(from: string, to: string): string {
    return path.relative(from, to).replaceAll("\\", "/")
  }
}
