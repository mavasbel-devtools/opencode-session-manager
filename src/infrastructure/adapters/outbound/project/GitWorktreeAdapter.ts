import { spawnSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import type { GitWorkTree, RegisteredWorktree } from "@session-manager/domain/model/GitWorktree"
import type { GitWorktreePort } from "@session-manager/domain/ports/outbound/GitWorktreePort"

/** The text of a file; null when it cannot be read. */
function readText(file: string): string | null {
  try {
    return fs.readFileSync(file, "utf8")
  } catch {
    return null
  }
}

function isDirectory(entry: string): boolean {
  return fs.statSync(entry, { throwIfNoEntry: false })?.isDirectory() === true
}

/** The real path when it exists, else the path as written (an old, moved-away path). */
function real(entry: string): string {
  try {
    return fs.realpathSync(entry)
  } catch {
    return path.resolve(entry)
  }
}

/**
 * Reads the `.git` entries Git keeps for its work trees — a main work tree's `.git` folder with
 * `worktrees/<id>/gitdir`, a linked work tree's `.git` file (`gitdir: <admin>`), relative or
 * absolute — and runs Git itself for the repair and for the check that it resolves.
 */
export class GitWorktreeAdapter implements GitWorktreePort {
  constructor(private readonly gitBinary = "git") {}

  locate(directory: string): GitWorkTree | null {
    if (!isDirectory(directory)) return null
    let root = real(directory)
    while (!fs.existsSync(path.join(root, ".git"))) {
      const parent = path.dirname(root)
      if (parent === root) return null
      root = parent
    }
    const marker = path.join(root, ".git")
    if (isDirectory(marker)) return { root, kind: "main", admin: null, recorded: null, worktrees: this.registered(marker) }
    const admin = this.gitFile(root)
    return { root, kind: "linked", admin, recorded: admin === null ? null : recordedBy(admin), worktrees: [] }
  }

  gitFile(folder: string): string | null {
    const match = /^gitdir:\s*(.+?)\s*$/m.exec(readText(path.join(folder, ".git")) ?? "")
    return match === null ? null : real(path.resolve(folder, match[1]!))
  }

  repair(cwd: string, paths: readonly string[]): boolean {
    return this.git(cwd, "worktree", "repair", ...paths) !== null
  }

  resolves(directory: string, root: string): boolean {
    const lines = this.git(directory, "rev-parse", "--path-format=absolute", "--show-toplevel", "--git-common-dir")?.split("\n")
    return lines !== undefined && lines.length === 2 && real(lines[0]!) === real(root) && isDirectory(lines[1]!)
  }

  private registered(common: string): RegisteredWorktree[] {
    const folder = path.join(common, "worktrees")
    if (!isDirectory(folder)) return []
    return fs
      .readdirSync(folder)
      .sort()
      .map((id) => path.join(folder, id))
      .filter(isDirectory)
      .map((admin) => {
        const recorded = recordedBy(admin)
        return { admin, recorded, points: recorded === null ? null : this.gitFile(recorded) }
      })
  }

  private git(folder: string, ...args: string[]): string | null {
    const result = spawnSync(this.gitBinary, ["-C", folder, ...args], { encoding: "utf8", windowsHide: true })
    return result.status === 0 ? result.stdout.trim() : null
  }
}

/** The work tree an administrative folder records in its `gitdir` file (without `/.git`). */
function recordedBy(admin: string): string | null {
  const text = readText(path.join(admin, "gitdir"))?.trim()
  if (text === undefined || text.length === 0) return null
  const gitFile = real(path.resolve(admin, text))
  return path.basename(gitFile) === ".git" ? path.dirname(gitFile) : gitFile
}
