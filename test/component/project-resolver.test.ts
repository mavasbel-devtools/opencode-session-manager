import { describe, it, expect } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { ProjectResolverAdapter } from "@transfer/infrastructure/adapters/outbound/project/ProjectResolverAdapter"

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

describe("ProjectResolverAdapter (URL normalization)", () => {
  it("normalizes HTTP and HTTPS git URLs correctly", () => {
    const normalize = (adapter as any).normalizeRemoteUrl.bind(adapter)
    expect(normalize("https://github.com/anomalyco/opencode.git")).toBe("github.com/anomalyco/opencode")
    expect(normalize("http://gitlab.com/group/repo.git/")).toBe("gitlab.com/group/repo")
  })

  it("normalizes SCP-like SSH git URLs correctly", () => {
    const normalize = (adapter as any).normalizeRemoteUrl.bind(adapter)
    expect(normalize("git@github.com:anomalyco/opencode.git")).toBe("github.com/anomalyco/opencode")
    expect(normalize("user@bitbucket.org:team/project.git")).toBe("bitbucket.org/team/project")
  })

  it("returns null for empty or non-URL remotes", () => {
    const normalize = (adapter as any).normalizeRemoteUrl.bind(adapter)
    expect(normalize("")).toBeNull()
    expect(normalize("   ")).toBeNull()
    expect(normalize("just-a-name")).toBeNull()
  })
})

describe("ProjectResolverAdapter (real repositories)", () => {
  it.skipIf(!gitAvailable)("resolves a non-git directory to the global project", async () => {
    const dir = tmpRepo()
    try {
      const resolved = await adapter.resolve(dir)
      expect(resolved.projectId).toBe("global")
      expect(resolved.worktree).toBe(path.parse(dir).root)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it.skipIf(!gitAvailable)("hashes the remote origin when present", async () => {
    const dir = tmpRepo()
    try {
      git(dir, ["init", "--quiet"])
      commit(dir, "root commit")
      git(dir, ["remote", "add", "origin", "https://github.com/example/project.git"])

      const resolved = await adapter.resolve(dir)
      const expected = createHash("sha1").update("git-remote:github.com/example/project").digest("hex")
      expect(resolved.projectId).toBe(expected)
      expect(resolved.relativePath).toBe("")
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it.skipIf(!gitAvailable)("falls back to the root commit when the remote is not a URL", async () => {
    const dir = tmpRepo()
    try {
      git(dir, ["init", "--quiet"])
      commit(dir, "root commit")
      git(dir, ["remote", "add", "origin", "just-a-name"])

      const rootCommit = spawnSync("git", ["rev-list", "--max-parents=0", "HEAD"], {
        cwd: dir,
        windowsHide: true,
        encoding: "utf8",
      }).stdout.trim()

      const resolved = await adapter.resolve(dir)
      expect(resolved.projectId).toBe(rootCommit)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it.skipIf(!gitAvailable)("falls back to the root commit when no remote exists", async () => {
    const dir = tmpRepo()
    try {
      git(dir, ["init", "--quiet"])
      commit(dir, "root commit")

      const rootCommit = spawnSync("git", ["rev-list", "--max-parents=0", "HEAD"], {
        cwd: dir,
        windowsHide: true,
        encoding: "utf8",
      }).stdout.trim()

      const resolved = await adapter.resolve(dir)
      expect(resolved.projectId).toBe(rootCommit)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it.skipIf(!gitAvailable)("falls back to a path hash for a repo without commits", async () => {
    const dir = tmpRepo()
    try {
      git(dir, ["init", "--quiet"])
      const resolved = await adapter.resolve(dir)
      const expected = createHash("sha1").update(path.resolve(dir).toLowerCase()).digest("hex")
      expect(resolved.projectId).toBe(expected)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
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
      expect(resolved.worktree.toLowerCase()).toBe(fs.realpathSync.native(dir).toLowerCase())
      expect(resolved.relativePath).toBe("packages/core")
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})
