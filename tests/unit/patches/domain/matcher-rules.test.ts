import { describe, expect, it } from "bun:test"
import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import type { PatchMatcher } from "@session-manager/domain/model/patches/Matcher"
import type { PatchedFile } from "@session-manager/domain/model/patches/Patch"
import { locate, type SourceFile } from "@session-manager/domain/services/patches/MatcherRules"
import { applyReplacements, releaseFor } from "@session-manager/domain/services/patches/PatchRules"
import { PATCHES } from "@session-manager/domain/patch-definitions/index"
import { sha } from "@test/support/patches/fakes"

const FIXTURES = path.resolve(import.meta.dir, "../../../support/patches/fixtures")
const VERSIONS = readdirSync(FIXTURES).map((name) => name.replace("magic-context-", ""))

/** A fixture's files under the matcher's directory, as the stager reads them. */
function fixtureSources(version: string, matcher: PatchMatcher): SourceFile[] {
  const root = path.join(FIXTURES, `magic-context-${version}`)
  return (readdirSync(path.join(root, matcher.directory), { recursive: true }) as string[])
    .filter((file) => file.endsWith(matcher.extension))
    .sort()
    .map((file) => ({ path: `${matcher.directory}/${file}`, text: readFileSync(path.join(root, matcher.directory, file), "utf8") }))
}

/** A version's files as the stager holds them while it applies the patches in order: each onto the last one's result. */
type Held = Map<string, string>

function held(version: string, directory: string, extension: string): Held {
  return new Map(fixtureSources(version, { directory, extension, sites: [] }).map((file) => [file.path, file.text]))
}

const sources = (texts: Held): SourceFile[] => [...texts].map(([path, text]) => ({ path, text }))

describe("the matchers on every reviewed release", () => {
  it("covers all sixteen fixtures", () => {
    expect(VERSIONS.length).toBe(16)
  })

  for (const patch of PATCHES) {
    for (const version of VERSIONS) {
      const release = releaseFor(patch, version)
      const unreviewed = release === undefined ? (patch.matcher.optional === true ? "holds fully or has nothing to change where it was never reviewed" : "does not hold where the patch was never reviewed") : "derives exactly the reviewed release"
      it(`${patch.id} on ${version}: ${unreviewed}`, () => {
        // Every patch before this one has been applied to the version's files first.
        const texts = held(version, patch.matcher.directory, patch.matcher.extension)
        for (const earlier of PATCHES.slice(0, PATCHES.indexOf(patch))) {
          if (releaseFor(earlier, version) === undefined) continue
          const applied = locate(earlier.matcher, sources(texts))
          if (applied.ok) for (const file of applied.files) texts.set(file.path, file.patched)
        }
        const located = locate(patch.matcher, sources(texts))
        if (release === undefined) {
          // A text an unreviewed version also carries still matches; only a partial match would be wrong.
          // An optional patch also holds when the version lacks its site entirely: nothing to change.
          if (patch.matcher.optional === true) expect(located.ok).toBe(true)
          if (located.ok) expect([0, Math.max(...patch.matcher.sites.map((site) => site.files))]).toContain(located.files.length)
          return
        }
        expect(located.ok).toBe(true)
        if (!located.ok) return
        const derived: PatchedFile[] = located.files.map((file) => ({ path: file.path, before: sha(file.text), after: sha(file.patched), replacements: file.shapes }))
        expect(new Set(derived.map((file) => file.path))).toEqual(new Set(release.files.map((file) => file.path)))
        for (const file of release.files) {
          const match = derived.find((entry) => entry.path === file.path)!
          expect(match).toEqual(file)
          const original = located.files.find((entry) => entry.path === file.path)!.text
          expect(located.files.find((entry) => entry.path === file.path)!.patched).toBe(applyReplacements(original, file))
        }
      })
    }
  }
})

describe("locate on crafted releases", () => {
  const site = { name: "old", files: 2, shapes: [{ find: "OLD", replace: "NEW", count: 2 }, { find: "ALT", replace: "NEW", count: 1 }], anchor: "site", window: 10 }
  const matcher: PatchMatcher = { directory: "dist", extension: ".js", sites: [site] }
  const file = (name: string, text: string): SourceFile => ({ path: `dist/${name}`, text })
  const good = [file("a.js", "site OLD OLD"), file("b.js", "site ALT"), file("c.js", "nothing")]

  it("accepts one shape per file with its exact count, near the anchor, in exactly the expected number of files", () => {
    const located = locate(matcher, good)
    expect(located.ok && located.files.map((f) => [f.path, f.shapes.map((s) => s.find), f.patched])).toEqual([
      ["dist/a.js", ["OLD"], "site NEW NEW"],
      ["dist/b.js", ["ALT"], "site NEW"],
    ])
  })

  it("stops on a wrong count, a missing or distant anchor, two shapes in one file, a replacement already present, or a wrong file count", () => {
    const reasons = [
      [file("a.js", "site OLD"), good[1]!],
      [file("a.js", "OLD OLD"), good[1]!],
      [file("a.js", "site OLD .......... OLD"), good[1]!],
      [file("a.js", "site OLD OLD ALT"), good[1]!],
      [file("a.js", "site OLD OLD NEW"), good[1]!],
      [good[0]!],
      [...good, file("d.js", "site ALT")],
    ].map((files) => {
      const located = locate(matcher, files)
      return located.ok ? "accepted" : located.reason
    })
    expect(reasons).toEqual([
      'dist/a.js: expected 2 × "OLD", found 1',
      'dist/a.js: the hit at offset 0 has no "site" within 10 characters before it',
      'dist/a.js: the hit at offset 20 has no "site" within 10 characters before it',
      'dist/a.js contains 2 different shapes of site "old"',
      'dist/a.js already contains the replacement "NEW"',
      'expected site "old" in 2 files, found it in 1 (dist/a.js)',
      'expected site "old" in 2 files, found it in 3 (dist/a.js, dist/b.js, dist/d.js)',
    ])
  })

  it("names no file when the site is nowhere", () => {
    expect(locate(matcher, [file("c.js", "nothing")])).toEqual({ ok: false, reason: 'expected site "old" in 2 files, found it in 0 (none)' })
  })

  describe("with several sites", () => {
    const sites: PatchMatcher = {
      directory: "dist",
      extension: ".js",
      sites: [
        { name: "first", files: 2, shapes: [{ find: "ONE", replace: "1", count: 1 }], anchor: "a:", window: 5 },
        { name: "second", files: 1, shapes: [{ find: "TWO", replace: "2", count: 1 }], anchor: "b:", window: 5 },
      ],
    }

    it("collects every site a file holds, in site order, and patches them all", () => {
      const located = locate(sites, [file("x.js", "b: TWO a: ONE"), file("y.js", "a: ONE"), file("z.js", "none")])
      expect(located.ok && located.files.map((f) => [f.path, f.shapes.map((s) => s.find), f.patched])).toEqual([
        ["dist/x.js", ["ONE", "TWO"], "b: 2 a: 1"],
        ["dist/y.js", ["ONE"], "a: 1"],
      ])
    })

    it("checks the file count of each site on its own", () => {
      const located = locate(sites, [file("x.js", "a: ONE b: TWO"), file("y.js", "a: ONE b: TWO")])
      expect(located).toEqual({ ok: false, reason: 'expected site "second" in 1 files, found it in 2 (dist/x.js, dist/y.js)' })
    })

    it("stops on the first site a file breaks", () => {
      const located = locate(sites, [file("x.js", "a: ONE TWO")])
      expect(located).toEqual({ ok: false, reason: 'dist/x.js: the hit at offset 7 has no "b:" within 5 characters before it' })
    })
  })
})
