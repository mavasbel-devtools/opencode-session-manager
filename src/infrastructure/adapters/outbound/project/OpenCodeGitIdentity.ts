import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { normalizeRemote } from "@session-manager/domain/services/GitRemote"

/** A git repository as git describes it from one of its folders. */
export interface GitRepository {
  /** `rev-parse --show-toplevel`, else the folder holding the `.git` found. */
  readonly worktree: string
  /** `rev-parse --git-common-dir` (absolute), or null when git cannot say. */
  readonly commonDirectory: string | null
}

/**
 * How OpenCode names a git repository's project, the same in OpenCode 1.18.32 and 2.0.26
 * (`Project.resolve`, `Git.remote.get`, `Git.history.rootCommits`): `sha1("git-remote:" + host/path)`
 * of the `origin` remote (no other remote is asked), else the id stored in
 * `<git-common-dir>/opencode`, else the first root commit in sorted order; none of these: null.
 * The two OpenCode hosts differ only around it (a folder outside any repository), which their own
 * adapters decide.
 */
export class OpenCodeGitIdentity {
  constructor(private readonly gitBinary = "git") {}

  /** The repository `folder` is in; `markerFolder` holds the `.git` found above it (the worktree when git cannot say). */
  repository(folder: string, markerFolder: string): GitRepository {
    const common = this.git(folder, "rev-parse", "--path-format=absolute", "--git-common-dir")
    return { worktree: this.git(folder, "rev-parse", "--show-toplevel") ?? markerFolder, commonDirectory: common }
  }

  id(repository: GitRepository): string | null {
    const normalized = normalizeRemote(this.git(repository.worktree, "remote", "get-url", "origin"))
    if (normalized !== null) return createHash("sha1").update(`git-remote:${normalized}`).digest("hex")
    const storedFile = repository.commonDirectory === null ? null : join(repository.commonDirectory, "opencode")
    if (storedFile !== null && existsSync(storedFile)) {
      const stored = readFileSync(storedFile, "utf8").trim()
      if (stored.length > 0) return stored
    }
    const roots = (this.git(repository.worktree, "rev-list", "--max-parents=0", "HEAD") ?? "")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .sort()
    return roots[0] ?? null
  }

  private git(folder: string, ...args: string[]): string | null {
    const result = spawnSync(this.gitBinary, ["-C", folder, ...args], { encoding: "utf8", windowsHide: true })
    return result.status === 0 ? result.stdout.trim() : null
  }
}
