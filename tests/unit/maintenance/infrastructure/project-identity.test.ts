import { afterEach, beforeEach, test } from "bun:test"
import assert from "node:assert/strict"
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { GitProjectIdentityAdapter } from "@session-manager/infrastructure/adapters/outbound/project/GitProjectIdentityAdapter"
import { makeRepository, sha1 } from "@test/support/maintenance/repositories"
import { removeTemporary, temporaryWorkspace } from "@test/support/maintenance/temporary"

let directory: string

beforeEach(() => {
  directory = temporaryWorkspace("oc-migrate-unit-")
})
afterEach(() => {
  removeTemporary(directory)
})

test("GitProjectIdentityAdapter derives OpenCode's ids: remote, stored id, root commit, plain folder", () => {
  const identity = new GitProjectIdentityAdapter()
  const plain = join(directory, "plain")
  mkdirSync(plain)
  assert.deepEqual(identity.resolve(plain), { id: sha1(`directory:${plain}`), worktree: plain, vcs: null, real: plain })
  assert.equal(identity.resolve(plain), identity.resolve(plain), "answers are cached")
  assert.equal(identity.resolve(join(directory, "none")), null)
  writeFileSync(join(directory, "file"), "")
  assert.equal(identity.resolve(join(directory, "file")), null)

  const remote = join(directory, "remote")
  makeRepository(remote, { remote: "git@GitHub.com:me/repo.git" })
  mkdirSync(join(remote, "sub"))
  assert.deepEqual(identity.resolve(join(remote, "sub")), {
    id: sha1("git-remote:github.com/me/repo"),
    worktree: remote,
    vcs: "git",
    real: join(remote, "sub"),
  })

  const upstream = join(directory, "upstream")
  makeRepository(upstream, { remote: "https://host/a/b", remoteName: "upstream" })
  assert.equal(identity.resolve(upstream)?.id, sha1("git-remote:host/a/b"))

  const stored = join(directory, "stored")
  makeRepository(stored, { remote: "/local/path", commit: true })
  writeFileSync(join(stored, ".git", "opencode"), "stored-id\n")
  assert.equal(identity.resolve(stored)?.id, "stored-id")

  const rooted = join(directory, "rooted")
  makeRepository(rooted, { commit: true })
  writeFileSync(join(rooted, ".git", "opencode"), "  \n")
  assert.match(identity.resolve(rooted)?.id ?? "", /^[0-9a-f]{40}$/)

  const empty = join(directory, "empty")
  makeRepository(empty)
  assert.deepEqual(identity.resolve(empty), { id: "global", worktree: "/", vcs: "git", real: empty })

  const hg = join(directory, "hg")
  mkdirSync(join(hg, ".hg"), { recursive: true })
  assert.equal(identity.resolve(hg), null)
})

test.skipIf(process.platform === "win32")("GitProjectIdentityAdapter falls back to the marker's folder when git cannot answer", () => {
  const repo = join(directory, "repo")
  makeRepository(repo, { remote: "https://host/r" })
  mkdirSync(join(repo, "sub"))
  // A git that knows the remote but fails every other question (as on a damaged worktree).
  const script = join(directory, "git-remote-only")
  writeFileSync(script, '#!/bin/sh\ncase "$3" in remote) [ "$4" = get-url ] && echo https://host/r || echo origin;; *) exit 1;; esac\n', { mode: 0o755 })
  assert.deepEqual(new GitProjectIdentityAdapter(script).resolve(join(repo, "sub")), {
    id: sha1("git-remote:host/r"),
    worktree: repo,
    vcs: "git",
    real: join(repo, "sub"),
  })
  assert.deepEqual(new GitProjectIdentityAdapter("false").resolve(repo), { id: "global", worktree: "/", vcs: "git", real: repo })
})
