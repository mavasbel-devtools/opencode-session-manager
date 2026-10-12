import { InvalidMapRuleError } from "@session-manager/domain/errors/InvalidMapRuleError"
import type { PathMapping, Relocation } from "@session-manager/domain/model/PathMapping"
import type { MapRule } from "@session-manager/domain/model/SessionSync"
import { NO_WINDOWS_PROFILE } from "@session-manager/domain/services/MapRules"
import { isWithin } from "@session-manager/domain/services/PosixPaths"

/** The folder moves of one `relocate`, and the text mapping they imply. */
export interface Relocations {
  /** The absolute folder moves, in the order given. */
  readonly folders: readonly Relocation[]
  /** Rewrites text: each folder absolute (with or without its leading slash) and, below the home, as `~/…`. */
  readonly mapping: PathMapping
  /** What text still holding an old folder contains: each `from` without its leading slash, and its `~/` form. */
  readonly hints: readonly string[]
}

const WINDOWS = /^[A-Za-z]:[\\/]|\\/

/**
 * The relocations `relocate --map <from>=<to>` rules give. Both sides must be absolute POSIX
 * folders, different, and neither inside the other; a folder below `home` is also matched as
 * `~/…` in text (the form shells and prompts write). Windows paths are `sync`'s business.
 */
export function relocationsFromRules(rules: readonly MapRule[], home: string): Relocations {
  if (rules.length === 0) throw new InvalidMapRuleError("(none)", "relocate needs at least one --map <from>=<to>")
  const folders: Relocation[] = []
  for (const rule of rules) {
    const label = `${rule.from}=${rule.to}`
    if (WINDOWS.test(rule.from) || WINDOWS.test(rule.to)) throw new InvalidMapRuleError(label, "relocate moves POSIX folders; map Windows paths with sync")
    if (!rule.from.startsWith("/") || !rule.to.startsWith("/")) throw new InvalidMapRuleError(label, "both folders must be absolute")
    const from = trimSlash(rule.from)
    const to = trimSlash(rule.to)
    if (from === "/" || isWithin(from, to) || isWithin(to, from)) throw new InvalidMapRuleError(label, "the folders must differ and neither may be inside the other")
    folders.push({ from, to })
  }
  const base = trimSlash(home)
  const tilde = (path: string) => (isWithin(base, path) && path !== base ? `~${path.slice(base.length)}` : null)
  const relocations: Relocation[] = []
  for (const folder of folders) {
    relocations.push(folder)
    const from = tilde(folder.from)
    if (from !== null) relocations.push({ from, to: tilde(folder.to) ?? folder.to })
  }
  return {
    folders,
    mapping: { home: base, windowsUser: NO_WINDOWS_PROFILE, drive: NO_WINDOWS_PROFILE, relocations },
    hints: relocations.map((relocation) => relocation.from.replace(/^\/+/, "")),
  }
}

/** Where a folder goes: below the first rule's `from` that holds it; null when no rule does. */
export function relocatedFolder(folders: readonly Relocation[], directory: string): string | null {
  for (const folder of folders) if (isWithin(folder.from, directory)) return folder.to + directory.slice(folder.from.length)
  return null
}

function trimSlash(path: string): string {
  return path.length > 1 ? path.replace(/\/+$/, "") : path
}
