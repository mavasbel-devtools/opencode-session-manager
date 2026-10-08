import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs"
import { basename, dirname, join } from "node:path"
import { GLOBAL_PROJECT, type ProjectIdentity } from "@session-manager/domain/model/Migration"
import type { ProjectIdentityPort } from "@session-manager/domain/ports/outbound/ProjectIdentityPort"
import { normalizeRemote } from "@session-manager/domain/services/GitRemote"

function sha1(text: string): string {
  return createHash("sha1").update(text).digest("hex")
}

/**
 * OpenCode v2's project resolution, run against this machine's folders:
 * a git repository → `sha1("git-remote:" + host/path)` of `origin` (else the first remote), else the
 * id stored in `<git-common-dir>/opencode`, else the root commit; a folder outside any repository →
 * `sha1("directory:" + realpath)`. A Mercurial checkout is not resolved (OpenCode treats it
 * differently and this machine has none), so its sessions keep their project.
 */
export class GitProjectIdentityAdapter implements ProjectIdentityPort {
  private readonly cache = new Map<string, ProjectIdentity | null>()
  private readonly gitBinary: string

  constructor(gitBinary = "git") {
    this.gitBinary = gitBinary
  }

  resolve(directory: string): ProjectIdentity | null {
    const cached = this.cache.get(directory)
    if (cached !== undefined) return cached
    const identity = this.derive(directory)
    this.cache.set(directory, identity)
    return identity
  }

  private derive(directory: string): ProjectIdentity | null {
    if (!existsSync(directory) || !statSync(directory).isDirectory()) return null
    const real = realpathSync(directory)
    const marker = this.findMarker(real)
    if (marker === null) return { id: sha1(`directory:${real}`), worktree: real, vcs: null, real }
    if (basename(marker) !== ".git") return null
    const id = this.gitId(real)
    // A repository with no remote, stored id or commit is OpenCode's global project, rooted at `/`.
    if (id === GLOBAL_PROJECT) return { id, worktree: "/", vcs: "git", real }
    const root = this.git(real, "rev-parse", "--show-toplevel") ?? dirname(marker)
    return { id, worktree: root, vcs: "git", real }
  }

  private gitId(folder: string): string {
    const remotes = (this.git(folder, "remote") ?? "").split(/\s+/).filter((name) => name.length > 0)
    const remote = remotes.includes("origin") ? "origin" : remotes[0]
    if (remote !== undefined) {
      const normalized = normalizeRemote(this.git(folder, "remote", "get-url", remote))
      if (normalized !== null) return sha1(`git-remote:${normalized}`)
    }
    const common = this.git(folder, "rev-parse", "--path-format=absolute", "--git-common-dir")
    const storedFile = common === null ? null : join(common, "opencode")
    if (storedFile !== null && existsSync(storedFile)) {
      const stored = readFileSync(storedFile, "utf8").trim()
      if (stored.length > 0) return stored
    }
    const roots = (this.git(folder, "rev-list", "--max-parents=0", "HEAD") ?? "").split(/\s+/)
    return roots[0] !== undefined && roots[0].length > 0 ? roots[0] : GLOBAL_PROJECT
  }

  private findMarker(start: string): string | null {
    let folder = start
    for (;;) {
      for (const marker of [".git", ".hg"]) {
        const candidate = join(folder, marker)
        if (existsSync(candidate)) return candidate
      }
      const parent = dirname(folder)
      if (parent === folder) return null
      folder = parent
    }
  }

  private git(folder: string, ...args: string[]): string | null {
    const result = spawnSync(this.gitBinary, ["-C", folder, ...args], { encoding: "utf8" })
    return result.status === 0 ? result.stdout.trim() : null
  }
}
