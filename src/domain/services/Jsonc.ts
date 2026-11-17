/** Blanks out a JSONC text's comments, keeping strings intact (a `//` inside a string stays). */
export function stripComments(text: string): string {
  let out = ""
  let index = 0
  let inString = false
  while (index < text.length) {
    const char = text[index]!
    const next = text[index + 1]
    if (inString) {
      out += char
      if (char === "\\") {
        out += next ?? ""
        index += 2
        continue
      }
      if (char === '"') inString = false
      index += 1
    } else if (char === '"') {
      inString = true
      out += char
      index += 1
    } else if (char === "/" && next === "/") {
      while (index < text.length && text[index] !== "\n") index += 1
    } else if (char === "/" && next === "*") {
      const end = text.indexOf("*/", index + 2)
      index = end === -1 ? text.length : end + 2
    } else {
      out += char
      index += 1
    }
  }
  return out
}

export const MAGIC_CONTEXT_PACKAGE = "@cortexkit/opencode-magic-context"

/** A string literal of a JSONC text (outside comments): its value and where its quotes are. */
export interface StringLiteral {
  readonly value: string
  readonly start: number
  readonly end: number
}

/** Every string literal outside comments, in order. */
export function stringLiterals(text: string): StringLiteral[] {
  const found: StringLiteral[] = []
  let index = 0
  while (index < text.length) {
    const char = text[index]!
    const next = text[index + 1]
    if (char === "/" && next === "/") {
      while (index < text.length && text[index] !== "\n") index += 1
    } else if (char === "/" && next === "*") {
      const end = text.indexOf("*/", index + 2)
      index = end === -1 ? text.length : end + 2
    } else if (char === '"') {
      let j = index + 1
      while (j < text.length && text[j] !== '"') j += text[j] === "\\" ? 2 : 1
      // An unterminated string ends the scan: nothing after it can be read as JSONC.
      if (j >= text.length) break
      const raw = text.slice(index, j + 1)
      found.push({ value: JSON.parse(raw) as string, start: index, end: j + 1 })
      index = j + 1
    } else {
      index += 1
    }
  }
  return found
}

/** Whether a plugin entry names Magic Context: the npm package (with or without `@<spec>`) or a folder holding it. */
export function isMagicContextEntry(value: string): boolean {
  return value === MAGIC_CONTEXT_PACKAGE || value.startsWith(`${MAGIC_CONTEXT_PACKAGE}@`) || (value.startsWith("/") && value.endsWith(`/${MAGIC_CONTEXT_PACKAGE}`))
}

/** Every Magic Context entry of opencode.jsonc. */
export function magicContextEntries(opencodeJsonc: string): StringLiteral[] {
  return stringLiterals(opencodeJsonc).filter((literal) => isMagicContextEntry(literal.value))
}

/**
 * What OpenCode is configured to load, from opencode.jsonc: the version spec of an npm entry
 * (`0.47.0`; `latest` for a bare package name), or the absolute folder of a path entry;
 * `null` when the plugin is not configured.
 */
export function pinnedMagicContext(opencodeJsonc: string): string | null {
  const entry = magicContextEntries(opencodeJsonc)[0]
  if (entry === undefined) return null
  if (entry.value.startsWith("/")) return entry.value
  return entry.value === MAGIC_CONTEXT_PACKAGE ? "latest" : entry.value.slice(MAGIC_CONTEXT_PACKAGE.length + 1)
}

/**
 * opencode.jsonc with its one Magic Context entry set to `value`, every other byte (comments,
 * layout) unchanged; `null` when there is not exactly one entry.
 */
export function replaceMagicContextEntry(opencodeJsonc: string, value: string): string | null {
  const entries = magicContextEntries(opencodeJsonc)
  if (entries.length !== 1) return null
  const [entry] = entries as [StringLiteral]
  return `${opencodeJsonc.slice(0, entry.start)}${JSON.stringify(value)}${opencodeJsonc.slice(entry.end)}`
}

/** The raw entry value (`@cortexkit/opencode-magic-context@0.49.19` or a folder), or null. */
export function magicContextEntry(opencodeJsonc: string): string | null {
  return magicContextEntries(opencodeJsonc)[0]?.value ?? null
}

/** A top-level numeric setting of magic-context.jsonc (`execute_threshold_percentage`), if set as a number. */
export function numericSetting(jsonc: string, key: string): number | null {
  const match = stripComments(jsonc).match(new RegExp(`"${key}"\\s*:\\s*(-?\\d+(?:\\.\\d+)?)`))
  if (match === null) return null
  return Number(match[1])
}
