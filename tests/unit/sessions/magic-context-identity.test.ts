import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { createHash } from "node:crypto"
import { mkdirSync, symlinkSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { MagicContextIdentityAdapter } from "@session-manager/infrastructure/adapters/outbound/magic-context/MagicContextIdentityAdapter"
import { removeTemporary, temporaryWorkspace } from "@test/support/maintenance/temporary"

let directory = ""
beforeEach(() => {
  directory = temporaryWorkspace("oc-mc-identity-")
})
afterEach(() => {
  removeTemporary(directory)
})

const dirIdentity = (path: string) => `dir:${createHash("md5").update(resolve(path)).digest("hex").slice(0, 12)}`
const git = (cwd: string, ...args: string[]) => {
  const result = Bun.spawnSync(["git", ...args], {
    cwd,
    env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" },
  })
  return result.stdout.toString().trim()
}

describe("MagicContextIdentityAdapter", () => {
  const identity = new MagicContextIdentityAdapter()

  it("names a git repository, and any folder inside it, by its root commit", () => {
    const repo = join(directory, "repo")
    mkdirSync(join(repo, "sub"), { recursive: true })
    git(repo, "init", "-q")
    git(repo, "commit", "-q", "--allow-empty", "-m", "root")
    const root = git(repo, "rev-list", "--max-parents=0", "HEAD")
    expect(identity.identityOf(repo)).toBe(`git:${root}`)
    expect(identity.identityOf(join(repo, "sub"))).toBe(`git:${root}`)
    symlinkSync(join(repo, "sub"), join(directory, "link"))
    expect(identity.identityOf(join(directory, "link"))).toBe(`git:${root}`)
  })

  it("names any other folder by the hash of its resolved path, also a repository git cannot answer for", () => {
    const plain = join(directory, "plain")
    mkdirSync(plain)
    expect(identity.identityOf(`${plain}/`)).toBe(dirIdentity(plain))
    const empty = join(directory, "empty")
    mkdirSync(empty)
    git(empty, "init", "-q")
    expect(identity.identityOf(empty)).toBe(dirIdentity(empty))
    expect(new MagicContextIdentityAdapter("no-such-git").identityOf(empty)).toBe(dirIdentity(empty))
  })

  it("has no identity for a folder that is not here, or a file", () => {
    expect(identity.identityOf(join(directory, "missing"))).toBeNull()
    writeFileSync(join(directory, "file"), "x")
    expect(identity.identityOf(join(directory, "file"))).toBeNull()
  })
})
