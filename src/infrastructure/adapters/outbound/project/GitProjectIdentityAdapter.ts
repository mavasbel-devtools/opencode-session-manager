import { createHash } from "node:crypto"
import { existsSync, realpathSync, statSync } from "node:fs"
import { basename, dirname, join } from "node:path"
import { GLOBAL_PROJECT, type ProjectIdentity } from "@session-manager/domain/model/PathMapping"
import type { ProjectIdentityPort } from "@session-manager/domain/ports/outbound/ProjectIdentityPort"
import type { OpenCodeGitIdentity } from "@session-manager/infrastructure/adapters/outbound/project/OpenCodeGitIdentity"

function sha1(text: string): string {
  return createHash("sha1").update(text).digest("hex")
}

/**
 * OpenCode 2's project resolution, run against this machine's folders: a git repository → its id
 * as OpenCode names it (`OpenCodeGitIdentity`); a folder outside any repository →
 * `sha1("directory:" + realpath)`. A Mercurial checkout is not resolved (OpenCode treats it
 * differently and this machine has none), so its sessions keep their project.
 */
export class GitProjectIdentityAdapter implements ProjectIdentityPort {
  private readonly cache = new Map<string, ProjectIdentity | null>()

  constructor(private readonly git: OpenCodeGitIdentity) {}

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
    const marker = findMarker(real)
    if (marker === null) return { id: sha1(`directory:${real}`), worktree: real, vcs: null, real }
    if (basename(marker) !== ".git") return null
    const repository = this.git.repository(real, dirname(marker))
    const id = this.git.id(repository) ?? GLOBAL_PROJECT
    // A repository with no remote, stored id or commit is OpenCode's global project, rooted at `/`.
    if (id === GLOBAL_PROJECT) return { id, worktree: "/", vcs: "git", real }
    return { id, worktree: repository.worktree, vcs: "git", real }
  }
}

/** The nearest `.git` or `.hg` at or above the folder. */
function findMarker(start: string): string | null {
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
