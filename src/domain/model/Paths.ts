/**
 * Pure path helpers for the `~` shorthand, so the domain and application layers
 * never import `node:path`. Both separators work: the home directory's own
 * separator is used when one has to be added.
 */

export function separatorOf(home: string): string {
  return home.includes("\\") && !home.includes("/") ? "\\" : "/"
}

function trimTrailing(directory: string): string {
  return directory.length > 1 ? directory.replace(/[\\/]+$/, "") : directory
}

/**
 * Expand a leading `~` to the user's home directory. Anything else is returned
 * unchanged; making it absolute is the filesystem adapter's job.
 */
export function expandHome(input: string, home: string): string {
  if (input === "~") return home
  if (input.startsWith("~/") || input.startsWith("~\\")) return `${trimTrailing(home)}${separatorOf(home)}${input.slice(2)}`
  return input
}

/** Render an absolute directory relative to home using the `~` shorthand. */
export function abbreviateHome(input: string, home: string): string {
  if (!home) return input
  const base = trimTrailing(home)
  if (input === base) return "~"
  const rest = input.slice(base.length)
  if (input.startsWith(base) && /^[\\/]/.test(rest)) return `~${rest}`
  return input
}
