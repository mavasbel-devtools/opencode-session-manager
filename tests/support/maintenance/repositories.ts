import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdirSync } from "node:fs"
import { Database } from "bun:sqlite"

export function sha1(text: string): string {
  return createHash("sha1").update(text).digest("hex")
}

function git(folder: string, ...args: string[]): void {
  const result = spawnSync(
    "git",
    ["-C", folder, "-c", "user.email=t@example.com", "-c", "user.name=t", "-c", "commit.gpgsign=false", ...args],
    { encoding: "utf8" },
  )
  if (result.status !== 0) throw new Error(`git ${args.join(" ")}: ${result.stderr}`)
}

/** `git init` with an optional remote and an optional first commit. */
export function makeRepository(folder: string, options: { remote?: string; remoteName?: string; commit?: boolean } = {}): void {
  mkdirSync(folder, { recursive: true })
  git(folder, "init", "-q")
  if (options.remote !== undefined) git(folder, "remote", "add", options.remoteName ?? "origin", options.remote)
  if (options.commit === true) git(folder, "commit", "-q", "--allow-empty", "-m", "first")
}

/** Runs a query read-only and returns plain objects. */
export function query<T>(dbPath: string, sql: string, ...params: (string | number)[]): T[] {
  const db = new Database(dbPath, { readonly: true })
  try {
    return (db.query(sql).all(...params) as Record<string, unknown>[]).map((row) => ({ ...row })) as T[]
  } finally {
    db.close()
  }
}
