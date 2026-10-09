import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, realpathSync, statSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import type { MagicContextIdentityPort } from "@session-manager/domain/ports/outbound/MagicContextIdentityPort"

/**
 * Magic Context's project identity, derived as its `resolveProjectIdentity` does
 * (plugin `memory/project-identity.ts`): inside a git repository (a `.git` in the folder or an
 * ancestor, also through the folder's real path) `git:` plus the smallest root commit of `HEAD`;
 * otherwise, or when git cannot answer, `dir:` plus the first 12 hex digits of the MD5 of the
 * resolved path (not the real path).
 */
export class MagicContextIdentityAdapter implements MagicContextIdentityPort {
  private readonly gitBinary: string

  constructor(gitBinary = "git") {
    this.gitBinary = gitBinary
  }

  identityOf(directory: string): string | null {
    const canonical = resolve(directory)
    if (!existsSync(canonical) || !statSync(canonical).isDirectory()) return null
    if (hasGitDir(canonical)) {
      const result = spawnSync(this.gitBinary, ["rev-list", "--max-parents=0", "HEAD"], {
        cwd: canonical,
        encoding: "utf8",
        env: { ...process.env, LC_ALL: "C", LANG: "C" },
      })
      const root =
        result.status === 0
          ? result.stdout
              .split("\n")
              .map((line) => line.trim().slice(0, 64))
              .filter((line) => /^[0-9a-f]{7,64}$/.test(line))
              .sort()[0]
          : undefined
      if (root !== undefined) return `git:${root}`
    }
    return `dir:${createHash("md5").update(canonical, "utf8").digest("hex").slice(0, 12)}`
  }
}

function hasGitDir(canonical: string): boolean {
  if (inChain(canonical)) return true
  const real = realpathSync.native(canonical)
  return real !== canonical && inChain(real)
}

function inChain(start: string): boolean {
  for (let current = start; ; current = dirname(current)) {
    if (existsSync(join(current, ".git"))) return true
    if (dirname(current) === current) return false
  }
}
