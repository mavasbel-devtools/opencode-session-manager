import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import type { ProjectResolverPort, ResolvedProject } from "@session-manager/domain/ports/outbound/ProjectResolverPort"

const GLOBAL = "global"

interface Repository {
  readonly worktree: string
  readonly commonDirectory: string
}

/**
 * Resolves a directory to a project exactly as the OpenCode 1.18.32 host does
 * (packages/core/src/project.ts `Project.resolve` and packages/core/src/git.ts
 * at tag v1.18.32), because the v1 lane writes the session row itself:
 *
 *   no `.git` above the directory → `global`, worktree `/`
 *   git repository → sha1(`git-remote:<host>/<path>`) of `origin`
 *                    ?? the id cached in `<git-common-dir>/opencode`
 *                    ?? the first sorted root commit
 *                    ?? `global`
 */
export class ProjectResolverAdapter implements ProjectResolverPort {
  constructor() {}

  async resolve(directory: string): Promise<ResolvedProject> {
    const resolved = path.resolve(directory)
    const repository = this.discover(resolved)
    if (!repository) {
      return { projectId: GLOBAL, worktree: "/", relativePath: this.relative(path.parse(resolved).root, resolved) }
    }
    const projectId = this.remoteId(repository) ?? this.cachedId(repository) ?? this.rootCommit(repository) ?? GLOBAL
    return { projectId, worktree: repository.worktree, relativePath: this.relative(repository.worktree, resolved) }
  }

  /** v1 `Git.repo.discover`: the nearest `.git` upwards, then `rev-parse` from its parent. */
  private discover(start: string): Repository | undefined {
    let current = start
    while (!fs.existsSync(path.join(current, ".git"))) {
      const parent = path.dirname(current)
      if (parent === current) return undefined
      current = parent
    }
    const topLevel = this.git(["rev-parse", "--show-toplevel"], current)
    const commonDirectory = this.git(["rev-parse", "--git-common-dir"], current)
    if (commonDirectory === undefined) return undefined
    return {
      worktree: topLevel === undefined ? current : path.resolve(current, topLevel),
      commonDirectory: path.resolve(current, commonDirectory),
    }
  }

  private remoteId(repository: Repository): string | undefined {
    const normalized = this.normalizeRemoteUrl(this.git(["remote", "get-url", "origin"], repository.worktree) ?? "")
    return normalized === undefined ? undefined : createHash("sha1").update(`git-remote:${normalized}`).digest("hex")
  }

  private cachedId(repository: Repository): string | undefined {
    try {
      return fs.readFileSync(path.join(repository.commonDirectory, "opencode"), "utf8").trim() || undefined
    } catch {
      return undefined
    }
  }

  private rootCommit(repository: Repository): string | undefined {
    const roots = this.git(["rev-list", "--max-parents=0", "HEAD"], repository.worktree)
    return roots
      ?.split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .sort()[0]
  }

  /** v1 `url` + `parts`: any URL scheme except `file:`, else the scp form `[user@]host:path`. */
  private normalizeRemoteUrl(url: string): string | undefined {
    const value = url.trim()
    if (!value) return undefined
    let host: string
    let name: string
    try {
      const parsed = new URL(value)
      if (parsed.protocol === "file:") return undefined
      host = parsed.hostname
      name = parsed.pathname
    } catch {
      const scp = value.match(/^([^@/:]+@)?([^/:]+):(.+)$/)
      if (!scp) return undefined
      host = scp[2]!
      name = scp[3]!
    }
    const pathname = name
      .replace(/^\/+/, "")
      .replace(/\.git\/?$/, "")
      .replace(/\/+$/, "")
    if (!host || !pathname) return undefined
    return `${host.toLowerCase()}/${pathname}`
  }

  private relative(from: string, to: string): string {
    return path.relative(from, to).replaceAll("\\", "/")
  }

  private git(args: readonly string[], cwd: string): string | undefined {
    const result = spawnSync("git", args, { cwd, encoding: "utf8", windowsHide: true })
    return result.status === 0 ? result.stdout.trim() : undefined
  }
}
