import { describe, expect, it } from "bun:test"
import { readFileSync } from "node:fs"
import path from "node:path"
import { applyReplacements, occurrences, releaseFor, revertReplacements } from "@session-manager/domain/services/patches/PatchRules"
import { PATCHES } from "@session-manager/domain/patch-definitions/index"
import { sha } from "@test/support/patches/fakes"

const repo = path.resolve(import.meta.dir, "../../../..")
const fixture = (version: string, file: string) => path.join(repo, "tests", "support", "patches", "fixtures", `magic-context-${version}`, file)
const VERSIONS = [...new Set(PATCHES.flatMap((patch) => patch.releases.map((release) => release.version)))]

describe("patch definitions", () => {
  it("have unique ids, existing evidence documents, and well-formed checksums and counts", () => {
    expect(new Set(PATCHES.map((patch) => patch.id)).size).toBe(PATCHES.length)
    for (const patch of PATCHES) {
      expect(readFileSync(path.join(repo, patch.evidence), "utf8").length).toBeGreaterThan(0)
      for (const release of patch.releases) {
        for (const file of release.files) {
          expect([file.before, file.after].every((value) => /^[0-9a-f]{64}$/.test(value))).toBe(true)
          expect(file.before).not.toBe(file.after)
          for (const r of file.replacements) expect([r.count > 0, r.find !== r.replace]).toEqual([true, true])
        }
      }
    }
  })

  // A file two patches change is read again as the previous patch left it, in the order patches are applied.
  it("turn the real upstream files into exactly the recorded results, and back", () => {
    for (const version of VERSIONS) {
      const current = new Map<string, string>()
      for (const patch of PATCHES) {
        const release = releaseFor(patch, version)
        if (release === undefined) continue
        for (const file of release.files) {
          const original = current.get(file.path) ?? readFileSync(fixture(version, file.path), "utf8")
          expect(sha(original)).toBe(file.before)
          const patched = applyReplacements(original, file)
          expect(sha(patched)).toBe(file.after)
          for (const r of file.replacements) expect(occurrences(patched, r.replace)).toBe(r.count)
          expect(revertReplacements(patched, file)).toBe(original)
          current.set(file.path, patched)
        }
      }
    }
  })
})
