import { afterEach, beforeEach, test } from "bun:test"
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, realpathSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { GitProjectIdentityAdapter } from "@session-manager/infrastructure/adapters/outbound/project/GitProjectIdentityAdapter"
import { OpenCodeGitIdentity } from "@session-manager/infrastructure/adapters/outbound/project/OpenCodeGitIdentity"
import { makeRepository, sha1 } from "@test/support/maintenance/repositories"
import { removeTemporary, temporaryWorkspace } from "@test/support/maintenance/temporary"
import { requires } from "@test/support/platform"

let directory: string

beforeEach(() => {
  directory = temporaryWorkspace("oc-migrate-unit-")
})
afterEach(() => {
  removeTemporary(directory)
})

test("GitProjectIdentityAdapter derives OpenCode's ids: remote, stored id, root commit, plain folder", () => {
  const identity = new GitProjectIdentityAdapter(new OpenCodeGitIdentity())
  mkdirSync(join(directory, "plain"))
  // The code resolves the path before hashing and comparing it, so the test compares resolved
  // paths too (`/var` vs `/private/var` on macOS).
  const plain = realpathSync(join(directory, "plain"))
  assert.deepEqual(identity.resolve(plain), { id: sha1(`directory:${plain}`), worktree: plain, vcs: null, real: plain })
  assert.equal(identity.resolve(plain), identity.resolve(plain), "answers are cached")
  assert.equal(identity.resolve(join(directory, "none")), null)
  writeFileSync(join(directory, "file"), "")
  assert.equal(identity.resolve(join(directory, "file")), null)

  const remoteDir = join(directory, "remote")
  makeRepository(remoteDir, { remote: "git@GitHub.com:me/repo.git" })
  const remote = realpathSync(remoteDir)
  mkdirSync(join(remote, "sub"))
  assert.deepEqual(identity.resolve(join(remote, "sub")), {
    id: sha1("git-remote:github.com/me/repo"),
    worktree: remote,
    vcs: "git",
    real: join(remote, "sub"),
  })

  // OpenCode asks only `origin`: a repository whose one remote has another name is named otherwise.
  const upstream = join(directory, "upstream")
  makeRepository(upstream, { remote: "https://host/a/b", remoteName: "upstream" })
  assert.equal(identity.resolve(upstream)?.id, "global")

  const stored = join(directory, "stored")
  makeRepository(stored, { remote: "/local/path", commit: true })
  writeFileSync(join(stored, ".git", "opencode"), "stored-id\n")
  assert.equal(identity.resolve(stored)?.id, "stored-id")

  const rooted = join(directory, "rooted")
  makeRepository(rooted, { commit: true })
  writeFileSync(join(rooted, ".git", "opencode"), "  \n")
  assert.match(identity.resolve(rooted)?.id ?? "", /^[0-9a-f]{40}$/)

  const emptyDir = join(directory, "empty")
  makeRepository(emptyDir)
  const empty = realpathSync(emptyDir)
  assert.deepEqual(identity.resolve(empty), { id: "global", worktree: "/", vcs: "git", real: empty })

  const hg = join(directory, "hg")
  mkdirSync(join(hg, ".hg"), { recursive: true })
  assert.equal(identity.resolve(hg), null)
})

const POSIX_SHELL = "needs a POSIX shell (/bin/sh) to run the fake git"
test.skipIf(requires(existsSync("/bin/sh"), POSIX_SHELL))(`GitProjectIdentityAdapter falls back to the marker's folder when git cannot answer (requires ${POSIX_SHELL})`, () => {
  const repo = join(directory, "repo")
  makeRepository(repo, { remote: "https://host/r" })
  // As above: the code resolves the worktree before comparing it.
  const resolved = realpathSync(repo)
  mkdirSync(join(resolved, "sub"))
  // A git that knows the remote but fails every other question (as on a damaged worktree).
  const script = join(directory, "git-remote-only")
  writeFileSync(script, '#!/bin/sh\ncase "$3" in remote) [ "$4" = get-url ] && echo https://host/r || echo origin;; *) exit 1;; esac\n', { mode: 0o755 })
  assert.deepEqual(new GitProjectIdentityAdapter(new OpenCodeGitIdentity(script)).resolve(join(resolved, "sub")), {
    id: sha1("git-remote:host/r"),
    worktree: resolved,
    vcs: "git",
    real: join(resolved, "sub"),
  })
  assert.deepEqual(new GitProjectIdentityAdapter(new OpenCodeGitIdentity("false")).resolve(resolved), { id: "global", worktree: "/", vcs: "git", real: resolved })
})

test("OpenCodeGitIdentity takes the first root commit in sorted order, as OpenCode does", () => {
  const repo = join(directory, "two-roots")
  makeRepository(repo, { commit: true })
  const run = (...args: string[]) => {
    const result = spawnSync("git", ["-C", repo, ...args], { encoding: "utf8" })
    assert.equal(result.status, 0, result.stderr)
    return result.stdout.trim()
  }
  const first = run("rev-parse", "--abbrev-ref", "HEAD")
  run("checkout", "--quiet", "--orphan", "other")
  writeFileSync(join(repo, "other.txt"), "other\n")
  run("add", ".")
  run("-c", "user.email=t@example.com", "-c", "user.name=T", "-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "other root")
  run("checkout", "--quiet", first)
  run("-c", "user.email=t@example.com", "-c", "user.name=T", "-c", "commit.gpgsign=false", "merge", "--quiet", "--allow-unrelated-histories", "-m", "join", "other")
  const roots = run("rev-list", "--max-parents=0", "HEAD").split("\n")
  assert.equal(roots.length, 2)
  const git = new OpenCodeGitIdentity()
  assert.equal(git.id(git.repository(repo, repo)), [...roots].sort()[0])
  assert.equal(new GitProjectIdentityAdapter(git).resolve(repo)?.id, [...roots].sort()[0])
})
