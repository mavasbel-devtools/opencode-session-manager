import type { PathMapping } from "@session-manager/domain/model/Migration"

/** Escapes a literal for use inside a regular expression. */
function literal(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")
}

/** A case-insensitive pattern for a literal, so the rest of a pattern can stay case-sensitive. */
function anyCase(text: string): string {
  return [...text]
    .map((char) => (char.toLowerCase() === char.toUpperCase() ? literal(char) : `[${char.toLowerCase()}${char.toUpperCase()}]`))
    .join("")
}

/** A terminal colour or cursor code, raw or JSON-escaped at any depth, as tool output stores it. */
const ANSI = String.raw`(?:\x1b|\\+u001b)\[[\d;?]*[A-Za-z]`
/** A JSON-escaped character such as `\u0013`, at any depth. */
const ESCAPED_CHAR = String.raw`\\+u[\da-fA-F]{4}`
/** A character that can continue a path segment: anything but whitespace, quotes, separators and the characters Windows forbids in names. */
const SEGMENT = String.raw`[^\s'"\x60\\/;<>:|?*]*`

/**
 * Where a path may start: the start of the text, a character that cannot be part of a name, or
 * just after a JSON escape such as `\n` (whose `n` would otherwise look like part of a name).
 */
const START = String.raw`(?<=^|[^\w.-]|\\[nrtbf]|${ANSI}|${ESCAPED_CHAR})`
/** Where a drive letter may start: as above, and also after `-`, as in a removed diff line. */
const DRIVE_START = String.raw`(?<=^|[^\w.]|\\[nrtbf]|${ANSI}|${ESCAPED_CHAR})`
/** Where a folder name ends: `Robin` matches in `Robin/x` and `Robin.`, not in `Robin2` or `Robin.bak`. */
const NAME_END = String.raw`(?![\w-]|\.[\w-])`

/** What the migration needs from a rewriter; `PathRewriter` is the real one. */
export interface TextRewriter {
  rewrite(text: string): string
  residual(text: string): boolean
}

/**
 * Rewrites a Windows user's profile paths to this machine's home, inside any text, at any JSON
 * nesting depth: `C:\Users\Me` is stored as `C:\\Users\\Me` in JSON, `C:\\\\Users\\\\Me` in JSON
 * inside JSON, and so on. A path keeps the separator run it started with, so the rewrite converts
 * exactly that run to `/` and stops where the path ends. Nothing outside a matched path changes,
 * so numbers, escapes and key order in JSON stay byte-identical.
 *
 * Forms rewritten, all case-insensitive in `Users` and the user name:
 * - drive paths `C:\Users\Me`, `C:/Users/Me` (also after `/`, as in `file:///C:/…` or `@fs/C:/…`, and
 *   `C\:\Users\Me` as Java properties escape it);
 * - `/mnt/c/Users/Me` (WSL), `/cygdrive/c/Users/Me`, `/c/Users/Me` (MSYS);
 * - `<mount>/Users/Me` for each folder the Windows drive is mounted at;
 * - `Users/Me` or `Users\Me` relative to `/`, the form OpenCode stores for a path below the root project.
 * Then each relocation moves a folder that lives somewhere else on this machine.
 */
export class PathRewriter implements TextRewriter {
  private readonly home: string
  private readonly quick: RegExp
  private readonly relocationHints: readonly string[]
  private readonly drivePath: RegExp
  private readonly posixPath: RegExp
  private readonly mountPaths: readonly RegExp[]
  private readonly relativePath: RegExp
  private readonly relocations: readonly { readonly pattern: RegExp; readonly to: string; readonly absolute: boolean }[]
  private readonly residualPath: RegExp

  constructor(mapping: PathMapping) {
    this.home = mapping.home
    const users = anyCase("Users")
    const user = anyCase(mapping.windowsUser)
    const drive = anyCase(mapping.drive)
    this.quick = /users/i
    this.drivePath = new RegExp(
      String.raw`${DRIVE_START}${drive}\\*:(\/|\\+)${users}\1${user}${NAME_END}((?:(?:\1(?!\\)|\/)${SEGMENT})*)`,
      "g",
    )
    this.posixPath = new RegExp(String.raw`${START}(?:\/mnt|\/cygdrive)?\/${drive}\/${users}\/${user}${NAME_END}`, "g")
    this.mountPaths = mapping.mounts.map(
      (mount) => new RegExp(String.raw`${START}${literal(mount.replace(/\/+$/, ""))}\/${users}\/${user}${NAME_END}`, "g"),
    )
    this.relativePath = new RegExp(
      String.raw`(?<=^|[^\w.\-/\\:]|\\[nrtbf]|${ANSI})${users}(\/|\\+)${user}${NAME_END}((?:(?:\1(?!\\)|\/)${SEGMENT})*)`,
      "g",
    )
    this.relocations = mapping.relocations.map((relocation) => ({
      // An absolute folder also matches without its leading slash, the form stored after `file:///` and `@fs/`.
      pattern: relocation.from.startsWith("/")
        ? new RegExp(String.raw`${START}(\/?)${literal(relocation.from.slice(1))}${NAME_END}`, "g")
        : new RegExp(String.raw`${START}(\/)?${literal(relocation.from)}${NAME_END}`, "g"),
      to: relocation.to,
      absolute: relocation.from.startsWith("/"),
    }))
    this.relocationHints = mapping.relocations.map((relocation) => relocation.from.replace(/^\/+/, ""))
    this.residualPath = new RegExp(String.raw`(?<![\w.-])${users}(?:\/|\\+)${user}${NAME_END}`)
  }

  /** The text with every profile path rewritten; the same string when there is nothing to rewrite. */
  rewrite(text: string): string {
    const relocatable = this.relocationHints.some((hint) => text.includes(hint))
    if (!this.quick.test(text) && !relocatable) return text
    const home = this.home
    let out = text.replace(this.drivePath, (_match, separator: string, tail: string, offset: number, whole: string) => {
      const root = whole[offset - 1] === "/" ? home.slice(1) : home
      return root + tail.split(separator).join("/")
    })
    out = out.replace(this.posixPath, home)
    for (const mount of this.mountPaths) out = out.replace(mount, home)
    out = out.replace(this.relativePath, (_match, separator: string, tail: string) => home.slice(1) + tail.split(separator).join("/"))
    for (const relocation of this.relocations) {
      out = out.replace(relocation.pattern, (_match, slash: string | undefined) => {
        if (!relocation.absolute) return (slash ?? "") + relocation.to
        return slash === "/" || !relocation.to.startsWith("/") ? relocation.to : relocation.to.slice(1)
      })
    }
    return out
  }

  /** True when the text still holds a path into the Windows profile, or a home doubled by a bad rewrite. */
  residual(text: string): boolean {
    return this.residualPath.test(text) || text.includes(this.home + this.home)
  }
}
