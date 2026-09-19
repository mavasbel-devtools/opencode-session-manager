import path from "node:path"

/**
 * Expand a leading `~` to the user's home directory.
 *
 * Node's `path.resolve` treats `~` as a literal relative folder name, so a user
 * typing `~/work` would otherwise resolve to `<cwd>/~/work`.
 */
export function expandHome(input: string, home: string): string {
  if (input === "~") return home
  if (input.startsWith("~/") || input.startsWith("~\\")) {
    return path.join(home, input.slice(2))
  }
  return path.resolve(input)
}

/**
 * Render an absolute directory relative to home using the `~` shorthand.
 */
export function abbreviateHome(input: string, home: string): string {
  if (!home) return input
  const relative = path.relative(home, input)
  if (relative === "") return "~"
  if (relative === ".." || relative.startsWith(".." + path.sep) || path.isAbsolute(relative)) return input
  return "~" + path.sep + relative
}
