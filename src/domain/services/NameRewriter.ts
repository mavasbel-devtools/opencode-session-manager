import type { NameRename } from "@session-manager/domain/model/NameRename"
import type { TextRewriter } from "@session-manager/domain/services/PathRewriter"

/** Escapes a literal for use inside a regular expression. */
function literal(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")
}

/** A terminal colour or cursor code, raw or JSON-escaped at any depth, as tool output stores it. */
const ANSI = String.raw`(?:\x1b|\\+u001b)\[[\d;?]*[A-Za-z]`
/** A JSON-escaped character such as `\u0027`, at any depth. */
const ESCAPED_CHAR = String.raw`\\+u[\da-fA-F]{4}`
/** A percent-encoded character such as `%2F` or `%3A`, as URLs carry a separator. */
const PERCENT = String.raw`%[\da-fA-F]{2}`

/**
 * Where a name may start: the start of the text, a character other than a letter, digit or `-`, or
 * just after a JSON escape (`\n`, `\u0027`), a terminal code or a percent-encoded character (`%3A`),
 * whose last character would otherwise look like part of the name.
 */
const START = String.raw`(?<=^|[^A-Za-z0-9-]|\\[nrtbf]|${ANSI}|${ESCAPED_CHAR}|${PERCENT})`
/**
 * Where a name ends: not before a letter, digit, `_` or `-`, so `relational-dbs` does not end inside
 * `relational-dbs-backups` or `relational-dbs_v2`. A `.` ends a name — a sentence's period and a
 * dotted key alike (`sync.2026-02-relational-dbs.parcial-1`, which the course's own tool renames).
 */
const END = String.raw`(?![A-Za-z0-9_-])`
/** In a path encoded with every non-alphanumeric as `-` (as Claude Code names its project folders), the name may go on with `-`. */
const ENCODED_END = String.raw`(?![A-Za-z0-9_])`

/** A path encoded the way Claude Code names a project folder: every character but a letter or digit becomes `-`. */
export function dashEncoded(path: string): string {
  return path.replace(/[^A-Za-z0-9]/g, "-")
}

/**
 * Replaces renamed folders' names wherever they stand as a whole name, at any JSON nesting depth
 * (a name holds no character JSON escapes): `2026-02-relational-dbs` in `/x/2026-02-relational-dbs/y`,
 * `C:\\…\\2026-02-relational-dbs\\y`, `2026-02-relational-dbs/labs-setup`, `%3A%3A2026-02-relational-dbs`,
 * "course (2026-02-relational-dbs)", a sentence ending "…2026-02-relational-dbs." or a dotted key
 * (`sync.2026-02-relational-dbs.parcial-1`), and in a dash-encoded path of its parent
 * (`-home-me-ITAM-2026-02-relational-dbs-worktrees-x`). Not inside a longer name
 * (`x2026-02-relational-dbs`, `a-2026-02-relational-dbs`, `2026-02-relational-dbs_v2`).
 * Longer names are tried first, so a name that extends another is replaced as itself.
 */
export class NameRewriter implements TextRewriter {
  private readonly pattern: RegExp
  private readonly probe: RegExp
  private readonly replacements: ReadonlyMap<string, string>
  private readonly needles: readonly string[]

  constructor(renames: readonly NameRename[]) {
    const ordered = [...renames].sort((a, b) => b.from.length - a.from.length || a.from.localeCompare(b.from))
    const alternatives = ordered.flatMap((rename) => [
      String.raw`(?<=${literal(dashEncoded(rename.parent))}-)${literal(rename.from)}${ENCODED_END}`,
      String.raw`${START}${literal(rename.from)}${END}`,
    ])
    const source = alternatives.length === 0 ? "(?!)" : alternatives.join("|")
    this.pattern = new RegExp(source, "g")
    this.probe = new RegExp(source)
    this.replacements = new Map(ordered.map((rename) => [rename.from, rename.to]))
    this.needles = ordered.map((rename) => rename.from)
  }

  /** The text with every renamed name replaced; the same string when there is none. */
  rewrite(text: string): string {
    if (!this.needles.some((needle) => text.includes(needle))) return text
    return text.replace(this.pattern, (match) => this.replacements.get(match)!)
  }

  /** True when the text still names a renamed folder as a whole name. */
  residual(text: string): boolean {
    return this.probe.test(text)
  }
}
