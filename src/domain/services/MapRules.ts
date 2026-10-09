import { InvalidMapRuleError } from "@session-manager/domain/errors/InvalidMapRuleError"
import type { PathMapping, Relocation } from "@session-manager/domain/model/PathMapping"
import type { MapRule } from "@session-manager/domain/model/SessionSync"

const WINDOWS_PROFILE = /^([A-Za-z]):[\\/]+Users[\\/]+([^\\/]+)(?:[\\/]+(.*?))?[\\/]*$/i
const WINDOWS_PATH = /^[A-Za-z]:[\\/]/

/**
 * A profile that matches nothing: the mapping of a sync whose rules only move POSIX folders.
 * `PathRewriter` always takes a Windows profile; a NUL user name never occurs in a path.
 */
export const NO_WINDOWS_PROFILE = "\u0000"

/** Parses `from=to` (the first `=` splits; both sides must be non-empty). */
export function parseMapRule(text: string): MapRule {
  const split = text.indexOf("=")
  const from = split < 0 ? "" : text.slice(0, split).trim()
  const to = split < 0 ? "" : text.slice(split + 1).trim()
  if (from === "" || to === "") throw new InvalidMapRuleError(text, "expected <from>=<to>")
  return { from, to }
}

/**
 * The path mapping a sync applies to every session's text and folders:
 * - `C:\Users\Me=/home/me` maps a Windows profile (both slash forms, any escaping) to a POSIX home;
 * - `C:\Users\Me\work=/srv/work` moves a folder inside that profile (it needs the profile's rule);
 * - `/old=/new` moves a POSIX folder.
 * Without a profile rule, a Windows profile the source's sessions live in is mapped to `home`.
 * Writing Windows paths (a Windows `to`) is refused. Null when there is nothing to rewrite.
 */
export function mappingFromRules(rules: readonly MapRule[], sourceDirectories: readonly string[], home: string): PathMapping | null {
  let profile: { drive: string; user: string; home: string } | null = null
  const deeper: { rule: MapRule; drive: string; user: string; rest: string }[] = []
  const relocations: Relocation[] = []
  for (const rule of rules) {
    const label = `${rule.from}=${rule.to}`
    if (WINDOWS_PATH.test(rule.to)) throw new InvalidMapRuleError(label, "writing Windows paths is not supported; the target must be a POSIX profile")
    if (!rule.to.startsWith("/")) throw new InvalidMapRuleError(label, "the target folder must be absolute")
    const to = trimSlash(rule.to)
    const windows = WINDOWS_PROFILE.exec(rule.from)
    if (windows !== null) {
      const [, drive, user, rest] = windows as unknown as [string, string, string, string | undefined]
      if (rest === undefined || rest === "") {
        if (profile !== null) throw new InvalidMapRuleError(label, "only one Windows profile can be mapped per sync")
        profile = { drive, user, home: to }
      } else deeper.push({ rule: { from: rule.from, to }, drive, user, rest })
    } else if (rule.from.startsWith("/")) relocations.push({ from: trimSlash(rule.from), to })
    else throw new InvalidMapRuleError(label, "the source folder must be absolute (a POSIX path or a Windows path under X:\\Users\\<name>)")
  }

  if (profile === null) profile = inferProfile(sourceDirectories, home, deeper[0])
  for (const entry of deeper) {
    if (profile === null || profile.drive.toLowerCase() !== entry.drive.toLowerCase() || profile.user.toLowerCase() !== entry.user.toLowerCase())
      throw new InvalidMapRuleError(`${entry.rule.from}=${entry.rule.to}`, "map the Windows profile it is in as well (for example C:\\Users\\<name>=/home/<you>)")
    // Applied after the profile mapping, so the folder is named by its POSIX form.
    relocations.unshift({ from: `${profile.home}/${entry.rest.replace(/[\\/]+/g, "/")}`, to: entry.rule.to })
  }
  if (profile === null && relocations.length === 0) return null
  return {
    home: profile?.home ?? home,
    windowsUser: profile?.user ?? NO_WINDOWS_PROFILE,
    drive: profile?.drive ?? NO_WINDOWS_PROFILE,
    relocations,
  }
}

/** The one Windows profile the sessions (or a deeper rule) live in, mapped to `home`; null when none. */
function inferProfile(directories: readonly string[], home: string, hint: { drive: string; user: string } | undefined) {
  const found = new Map<string, { drive: string; user: string; home: string }>()
  if (hint !== undefined) found.set(`${hint.drive}:${hint.user}`.toLowerCase(), { drive: hint.drive, user: hint.user, home })
  for (const directory of directories) {
    const match = WINDOWS_PROFILE.exec(directory)
    if (match !== null) found.set(`${match[1]}:${match[2]}`.toLowerCase(), { drive: match[1]!, user: match[2]!, home })
  }
  if (found.size > 1)
    throw new InvalidMapRuleError("(none)", `the sessions live in several Windows profiles (${[...found.keys()].join(", ")}); map the one to sync with --map X:\\Users\\<name>=<home>`)
  return found.size === 1 ? [...found.values()][0]! : null
}

function trimSlash(path: string): string {
  return path.length > 1 ? path.replace(/\/+$/, "") : path
}
