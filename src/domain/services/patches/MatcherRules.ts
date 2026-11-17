import type { MatcherShape, MatcherSite, PatchMatcher } from "@session-manager/domain/model/patches/Matcher"
import { occurrences } from "@session-manager/domain/services/patches/PatchRules"

/** A file of a package: its path relative to the package root, and its text. */
export interface SourceFile {
  readonly path: string
  readonly text: string
}

/** A file the matcher accepted: the shape of each site it holds, in site order, and the text with them replaced. */
export interface MatchedFile {
  readonly path: string
  readonly text: string
  readonly shapes: readonly MatcherShape[]
  readonly patched: string
}

export type Located = { readonly ok: true; readonly files: readonly MatchedFile[] } | { readonly ok: false; readonly reason: string }

const positions = (text: string, needle: string): number[] => {
  const found: number[] = []
  for (let at = text.indexOf(needle); at !== -1; at = text.indexOf(needle, at + needle.length)) found.push(at)
  return found
}

/** The shape of `site` that `file` holds, `null` when it holds none, or why the file breaks the site's rules. */
function matchSite(site: MatcherSite, file: SourceFile): MatcherShape | string | null {
  const replaced = site.shapes.filter((shape) => occurrences(file.text, shape.replace) > 0)
  if (replaced.length > 0) return `${file.path} already contains the replacement ${JSON.stringify(replaced[0]!.replace)}`
  const present = site.shapes.filter((shape) => occurrences(file.text, shape.find) > 0)
  if (present.length === 0) return null
  if (present.length > 1) return `${file.path} contains ${present.length} different shapes of site "${site.name}"`
  const shape = present[0]!
  const hits = positions(file.text, shape.find)
  if (hits.length !== shape.count) return `${file.path}: expected ${shape.count} × ${JSON.stringify(shape.find)}, found ${hits.length}`
  for (const hit of hits) {
    const anchor = file.text.lastIndexOf(site.anchor, hit)
    if (anchor === -1 || hit - anchor > site.window) {
      return `${file.path}: the hit at offset ${hit} has no ${JSON.stringify(site.anchor)} within ${site.window} characters before it`
    }
  }
  return shape
}

/** Finds a patch's sites in the files of an unreviewed release, or says exactly why it will not. */
export function locate(matcher: PatchMatcher, files: readonly SourceFile[]): Located {
  const holders = matcher.sites.map(() => [] as string[])
  const matched: MatchedFile[] = []
  for (const file of files) {
    const shapes: MatcherShape[] = []
    for (const [index, site] of matcher.sites.entries()) {
      const result = matchSite(site, file)
      if (typeof result === "string") return { ok: false, reason: result }
      if (result === null) continue
      shapes.push(result)
      holders[index]!.push(file.path)
    }
    if (shapes.length === 0) continue
    const patched = shapes.reduce((text, shape) => text.split(shape.find).join(shape.replace), file.text)
    matched.push({ path: file.path, text: file.text, shapes, patched })
  }
  if (matcher.optional === true && matched.length === 0) return { ok: true, files: [] }
  for (const [index, site] of matcher.sites.entries()) {
    const where = holders[index]!
    if (where.length !== site.files) {
      return { ok: false, reason: `expected site "${site.name}" in ${site.files} files, found it in ${where.length} (${where.join(", ") || "none"})` }
    }
  }
  return { ok: true, files: matched }
}
