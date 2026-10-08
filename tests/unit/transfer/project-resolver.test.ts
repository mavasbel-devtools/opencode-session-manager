import { describe, it, expect } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { ProjectResolverAdapter } from "@session-manager/infrastructure/adapters/outbound/project/ProjectResolverAdapter"
import { removeTemporarySync } from "@test/support/live/process"

const adapter = new ProjectResolverAdapter()

function hasGit(): boolean {
  try {
    return spawnSync("git", ["--version"], { windowsHide: true }).status === 0
  } catch {
    return false
  }
}

const gitAvailable = hasGit()

function tmpRepo(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "resolver-"))
}

function git(cwd: string, args: string[]): void {
  const result = spawnSync("git", args, { cwd, windowsHide: true, encoding: "utf8" })
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`)
}

function commit(cwd: string, message: string): void {
  git(cwd, ["config", "core.autocrlf", "false"])
  git(cwd, ["config", "commit.gpgsign", "false"])
  git(cwd, ["config", "user.email", "test@example.com"])
  git(cwd, ["config", "user.name", "Test"])
  fs.writeFileSync(path.join(cwd, `${message.replace(/\s+/g, "-")}.txt`), `${message}\n`)
  git(cwd, ["add", "."])
  git(cwd, ["commit", "-m", message])
}

const sha1 = (value: string) => createHash("sha1").update(value).digest("hex")

function rootCommitOf(dir: string): string {
  return spawnSync("git", ["rev-list", "--max-parents=0", "HEAD"], { cwd: dir, windowsHide: true, encoding: "utf8" }).stdout.trim()
}

describe("ProjectResolverAdapter (v1.18.32 remote normalization)", () => {
  const normalize = (adapter as any).normalizeRemoteUrl.bind(adapter) as (url: string) => string | undefined

  it("normalizes any URL scheme, stripping the leading slash, .git and trailing slashes", () => {
    expect(normalize("https://github.com/anomalyco/opencode.git")).toBe("github.com/anomalyco/opencode")
    expect(normalize("http://GitLab.com/group/repo.git/")).toBe("gitlab.com/group/repo")
    expect(normalize("ssh://git@host.example:2222/team/repo.git")).toBe("host.example/team/repo")
    expect(normalize("https://host.example/mnt/git/itam/relational-dbs/")).toBe("host.example/mnt/git/itam/relational-dbs")
  })

  it("normalizes the scp form [user@]host:path", () => {
    expect(normalize("git@github.com:anomalyco/opencode.git")).toBe("github.com/anomalyco/opencode")
    expect(normalize("user@bitbucket.org:team/project.git")).toBe("bitbucket.org/team/project")
  })

  it("rejects file: URLs, empty values, bare names, and URLs without a host or a path", () => {
    expect(normalize("file:///srv/git/repo.git")).toBeUndefined()
    expect(normalize("")).toBeUndefined()
    expect(normalize("   ")).toBeUndefined()
    expect(normalize("just-a-name")).toBeUndefined()
    expect(normalize("github.com:a/b")).toBeUndefined()
    expect(normalize("https://host.example/")).toBeUndefined()
  })
})

describe("ProjectResolverAdapter (real repositories)", () => {
  it.skipIf(!gitAvailable)("resolves a directory outside any repository to the global project at /", async () => {
    const dir = tmpRepo()
    try {
      const resolved = await adapter.resolve(path.join(dir, "child"))
      expect(resolved).toEqual({
        projectId: "global",
        worktree: "/",
        relativePath: path.relative(path.parse(dir).root, path.join(dir, "child")).replaceAll("\\", "/"),
      })
    } finally {
      removeTemporarySync(dir)
    }
  })

  it.skipIf(!gitAvailable)("hashes the origin remote when it normalizes", async () => {
    const dir = tmpRepo()
    try {
      git(dir, ["init", "--quiet"])
      commit(dir, "root commit")
      git(dir, ["remote", "add", "origin", "https://github.com/example/project.git"])
      const resolved = await adapter.resolve(dir)
      expect(resolved.projectId).toBe(sha1("git-remote:github.com/example/project"))
      expect(resolved.relativePath).toBe("")
    } finally {
      removeTemporarySync(dir)
    }
  })

  it.skipIf(!gitAvailable)("uses the id cached in <git-common-dir>/opencode before the root commit", async () => {
    const dir = tmpRepo()
    try {
      git(dir, ["init", "--quiet"])
      commit(dir, "root commit")
      git(dir, ["remote", "add", "origin", "just-a-name"])
      fs.writeFileSync(path.join(dir, ".git", "opencode"), "cached-project-id\n")
      expect((await adapter.resolve(dir)).projectId).toBe("cached-project-id")
    } finally {
      removeTemporarySync(dir)
    }
  })

  it.skipIf(!gitAvailable)("ignores an empty cache file and falls back to the root commit", async () => {
    const dir = tmpRepo()
    try {
      git(dir, ["init", "--quiet"])
      commit(dir, "root commit")
      fs.writeFileSync(path.join(dir, ".git", "opencode"), "  \n")
      expect((await adapter.resolve(dir)).projectId).toBe(rootCommitOf(dir))
    } finally {
      removeTemporarySync(dir)
    }
  })

  it.skipIf(!gitAvailable)("falls back to the root commit when no remote exists", async () => {
    const dir = tmpRepo()
    try {
      git(dir, ["init", "--quiet"])
      commit(dir, "root commit")
      expect((await adapter.resolve(dir)).projectId).toBe(rootCommitOf(dir))
    } finally {
      removeTemporarySync(dir)
    }
  })

  it.skipIf(!gitAvailable)("resolves a repository without commits to global, at its worktree", async () => {
    const dir = tmpRepo()
    try {
      git(dir, ["init", "--quiet"])
      const resolved = await adapter.resolve(dir)
      expect(resolved.projectId).toBe("global")
      expect(resolved.worktree).toBe(fs.realpathSync.native(dir))
    } finally {
      removeTemporarySync(dir)
    }
  })

  it.skipIf(!gitAvailable)("treats a .git that git rejects as no repository", async () => {
    const dir = tmpRepo()
    try {
      fs.mkdirSync(path.join(dir, ".git"))
      expect((await adapter.resolve(dir)).projectId).toBe("global")
    } finally {
      removeTemporarySync(dir)
    }
  })

  it.skipIf(!gitAvailable)("resolves a nested subdirectory to its worktree with a relative path", async () => {
    const dir = tmpRepo()
    try {
      git(dir, ["init", "--quiet"])
      commit(dir, "root commit")
      const nested = path.join(dir, "packages", "core")
      fs.mkdirSync(nested, { recursive: true })
      const resolved = await adapter.resolve(nested)
      expect(resolved.worktree).toBe(fs.realpathSync.native(dir))
      expect(resolved.relativePath).toBe("packages/core")
    } finally {
      removeTemporarySync(dir)
    }
  })
})
