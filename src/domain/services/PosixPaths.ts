/** POSIX path arithmetic for the paths stored in the database, so the domain never imports `node:path`. */

function segments(path: string): string[] {
  return path.split("/").filter((part) => part.length > 0 && part !== ".")
}

/** True when `path` is `folder` or below it. */
export function isWithin(folder: string, path: string): boolean {
  const base = folder.replace(/\/+$/, "")
  return path === base || path.startsWith(`${base}/`) || base === ""
}

/**
 * The value OpenCode stores in `session.path`: the session folder relative to its project's
 * worktree, or `null` when they are the same folder. `directory` must be the worktree or below it
 * (see `isWithin`); every caller checks that first.
 */
export function sessionSubpath(worktree: string, directory: string): string | null {
  const rest = segments(directory).slice(segments(worktree).length).join("/")
  return rest === "" ? null : rest
}
