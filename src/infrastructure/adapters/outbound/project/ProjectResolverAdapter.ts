import path from "node:path"
import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import type { ProjectResolverPort, ResolvedProject } from "@session-manager/domain/ports/outbound/ProjectResolverPort"

export class ProjectResolverAdapter implements ProjectResolverPort {
  constructor() {}

  async resolve(directory: string): Promise<{
    projectId: string
    worktree: string
    relativePath: string
  }> {
    const resolvedDir = path.resolve(directory)

    // Check if git repository
    const gitTopLevel = this.execGit(["rev-parse", "--show-toplevel"], resolvedDir)
    if (!gitTopLevel) {
      const parsed = path.parse(resolvedDir)
      return {
        projectId: "global",
        worktree: parsed.root,
        relativePath: path.relative(parsed.root, resolvedDir).replaceAll("\\", "/"),
      }
    }

    const worktree = path.resolve(gitTopLevel)
    const relativePath = path.relative(worktree, resolvedDir).replaceAll("\\", "/")

    // Check remote origin
    const remoteOrigin = this.execGit(["config", "--get", "remote.origin.url"], worktree)
    if (remoteOrigin) {
      const normalized = this.normalizeRemoteUrl(remoteOrigin)
      if (normalized) {
        const hash = createHash("sha1").update(`git-remote:${normalized}`).digest("hex")
        return {
          projectId: hash,
          worktree,
          relativePath,
        }
      }
    }

    // Check root commit
    const rootCommit = this.execGit(["rev-list", "--max-parents=0", "HEAD"], worktree)
    if (rootCommit) {
      return {
        projectId: rootCommit.split("\n")[0] ?? rootCommit,
        worktree,
        relativePath,
      }
    }

    // Fallback deterministic hash of worktree path
    const fallbackId = createHash("sha1").update(worktree.toLowerCase()).digest("hex")
    return {
      projectId: fallbackId,
      worktree,
      relativePath,
    }
  }

  private normalizeRemoteUrl(url: string): string | null {
    const trimmed = url.trim()
    if (!trimmed) return null

    try {
      if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
        const parsed = new URL(trimmed)
        const pathname = parsed.pathname.replace(/^\/+/, "").replace(/\.git\/?$/, "")
        return `${parsed.hostname.toLowerCase()}/${pathname}`
      }
    } catch (_) {}

    const scp = trimmed.match(/^([^@/:]+@)?([^/:]+):(.+)$/)
    if (scp && scp[2] && scp[3]) {
      const host = scp[2].toLowerCase()
      const pathname = scp[3].replace(/^\/+/, "").replace(/\.git\/?$/, "")
      return `${host}/${pathname}`
    }

    return null
  }

  private execGit(args: string[], cwd: string): string | null {
    try {
      const res = spawnSync("git", args, { cwd, encoding: "utf8", windowsHide: true })
      if (res.status === 0 && res.stdout) {
        return res.stdout.trim()
      }
    } catch (_) {}
    return null
  }
}
