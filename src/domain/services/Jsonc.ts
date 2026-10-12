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

/**
 * The Magic Context version OpenCode's configuration asks for (`0.47.0`; `latest` for the bare
 * package name), or null when the plugin is not configured there.
 */
export function pinnedMagicContext(opencodeJsonc: string): string | null {
  const match = stripComments(opencodeJsonc).match(/"@cortexkit\/opencode-magic-context(?:@([^"]+))?"/)
  if (match === null) return null
  return match[1] ?? "latest"
}
