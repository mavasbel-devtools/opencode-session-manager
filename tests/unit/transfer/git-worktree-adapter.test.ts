// Real Git, real folders: the adapter reads what Git writes and runs Git itself.
import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { GitWorktreeAdapter } from "@session-manager/infrastructure/adapters/outbound/project/GitWorktreeAdapter"

const GIT_ENV = { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t", GIT_CONFIG_NOSYSTEM: "1", HOME: os.tmpdir() }

function git(cwd: string, ...args: string[]): string {
  const result = spawnSync("git", ["-C", cwd, ...args], { encoding: "utf8", env: GIT_ENV })
  if (result.status !== 0) throw new Error(`git ${args.join(" ")}: ${result.stderr}`)
  return result.stdout.trim()
}

let root = ""
const adapter = new GitWorktreeAdapter()

beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "session-manager-worktree-")))
})

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true })
})

/** A repository with one commit and a linked work tree `wt` beside it. */
function repository(): { repo: string; wt: string; admin: string } {
  const repo = path.join(root, "repo")
  fs.mkdirSync(path.join(repo, "src"), { recursive: true })
  git(repo, "init", "-q", "-b", "main")
  fs.writeFileSync(path.join(repo, "src", "file.txt"), "x")
  git(repo, "add", ".")
  git(repo, "commit", "-q", "-m", "init")
  const wt = path.join(root, "wt")
  git(repo, "worktree", "add", "-q", "-b", "feature", wt)
  return { repo, wt, admin: path.join(repo, ".git", "worktrees", "wt") }
}

describe("GitWorktreeAdapter", () => {
  it("finds nothing for a missing folder or one outside Git", () => {
    expect(adapter.locate(path.join(root, "missing"))).toBeNull()
    fs.mkdirSync(path.join(root, "plain"))
    expect(adapter.locate(path.join(root, "plain"))).toBeNull()
    expect(adapter.gitFile(path.join(root, "plain"))).toBeNull()
    expect(adapter.resolves(path.join(root, "plain"), path.join(root, "plain"))).toBe(false)
  })

  it("describes a main work tree from a subfolder and its registered linked work tree", () => {
    const { repo, wt, admin } = repository()
    expect(adapter.locate(path.join(repo, "src"))).toEqual({ root: repo, kind: "main", admin: null, recorded: null, worktrees: [{ admin, recorded: wt, points: admin }] })
    expect(adapter.locate(wt)).toEqual({ root: wt, kind: "linked", admin, recorded: wt, worktrees: [] })
    expect([adapter.resolves(path.join(repo, "src"), repo), adapter.resolves(wt, wt), adapter.resolves(wt, repo)]).toEqual([true, true, false])
  })

  it("repairs a moved linked work tree from inside it", () => {
    const { repo, wt, admin } = repository()
    const moved = path.join(root, "moved-wt")
    fs.renameSync(wt, moved)
    expect(adapter.locate(moved)).toEqual({ root: moved, kind: "linked", admin, recorded: wt, worktrees: [] })
    expect(adapter.repair(moved, [])).toBe(true)
    expect(adapter.locate(moved)!.recorded).toBe(moved)
    expect(adapter.locate(repo)!.worktrees).toEqual([{ admin, recorded: moved, points: admin }])
  })

  it("repairs a moved main work tree from it, naming its linked work tree", () => {
    const { repo, wt } = repository()
    const moved = path.join(root, "moved-repo")
    fs.renameSync(repo, moved)
    const newAdmin = path.join(moved, ".git", "worktrees", "wt")
    expect(adapter.locate(wt)).toEqual({ root: wt, kind: "linked", admin: path.join(repo, ".git", "worktrees", "wt"), recorded: null, worktrees: [] })
    expect(adapter.resolves(wt, wt)).toBe(false)
    expect(adapter.repair(moved, [wt])).toBe(true)
    expect(adapter.locate(wt)).toEqual({ root: wt, kind: "linked", admin: newAdmin, recorded: wt, worktrees: [] })
    expect(adapter.resolves(wt, wt)).toBe(true)
  })

  it("resolves relative gitdir links, and reads an administrative gitdir that does not end in .git as written", () => {
    const { wt, admin } = repository()
    fs.writeFileSync(path.join(wt, ".git"), `gitdir: ${path.relative(wt, admin)}\n`)
    fs.writeFileSync(path.join(admin, "gitdir"), `${path.relative(admin, path.join(root, "elsewhere"))}\n`)
    expect(adapter.locate(wt)).toEqual({ root: wt, kind: "linked", admin, recorded: path.join(root, "elsewhere"), worktrees: [] })
  })

  it("reports unreadable links as unknown rather than guessing", () => {
    const { repo, wt, admin } = repository()
    fs.writeFileSync(path.join(admin, "gitdir"), "")
    fs.writeFileSync(path.join(repo, ".git", "worktrees", "stray-file"), "")
    expect(adapter.locate(repo)!.worktrees).toEqual([{ admin, recorded: null, points: null }])
    fs.writeFileSync(path.join(wt, ".git"), "not a gitdir line\n")
    expect(adapter.locate(wt)).toEqual({ root: wt, kind: "linked", admin: null, recorded: null, worktrees: [] })
  })

  it("lists no registered work trees for a repository without any", () => {
    const repo = path.join(root, "solo")
    fs.mkdirSync(repo)
    git(repo, "init", "-q")
    expect(adapter.locate(repo)).toEqual({ root: repo, kind: "main", admin: null, recorded: null, worktrees: [] })
  })

  it("reports a refused repair and a missing Git binary as failures", () => {
    fs.mkdirSync(path.join(root, "plain"))
    expect(adapter.repair(path.join(root, "plain"), [])).toBe(false)
    const noGit = new GitWorktreeAdapter(path.join(root, "no-such-git"))
    expect([noGit.repair(root, []), noGit.resolves(root, root)]).toEqual([false, false])
  })
})
