import { describe, expect, it } from "bun:test"
import { PatchError } from "@session-manager/domain/errors/PatchError"
import {
  applyReplacements,
  fileState,
  occurrences,
  patchState,
  releaseFor,
  revertReplacements,
} from "@session-manager/domain/services/patches/PatchRules"
import { ORIGINAL_A, PATCHED_A, sha, smallPatch } from "@test/support/patches/fakes"

const fileA = smallPatch.releases[0]!.files[0]!

describe("PatchRules", () => {
  it("finds the release for a version, or none", () => {
    expect(releaseFor(smallPatch, "1.0.0")?.version).toBe("1.0.0")
    expect(releaseFor(smallPatch, "2.0.0")).toBeUndefined()
  })

  it("classifies a file by its checksum", () => {
    expect(fileState(fileA, sha(ORIGINAL_A))).toBe("original")
    expect(fileState(fileA, sha(PATCHED_A))).toBe("patched")
    expect(fileState(fileA, sha("other"))).toBe("changed")
    expect(fileState(fileA, null)).toBe("missing")
  })

  // A file two patches change: carried past this patch (later) or not carried to it yet (earlier).
  it("classifies a file another patch on the same version also changes", () => {
    expect(fileState(fileA, sha(PATCHED_A), [sha(PATCHED_A)])).toBe("patched")
    expect(fileState(fileA, sha(ORIGINAL_A), [], [sha(ORIGINAL_A)])).toBe("original")
    expect(fileState(fileA, sha("other"), [sha(PATCHED_A)], [sha(ORIGINAL_A)])).toBe("changed")
  })

  it("classifies a patch from its files, the worst state first", () => {
    expect(patchState(["patched", "missing", "changed"])).toBe("missing-file")
    expect(patchState(["patched", "changed"])).toBe("changed")
    expect(patchState(["patched", "patched"])).toBe("applied")
    expect(patchState(["original", "original"])).toBe("not-applied")
    expect(patchState(["original", "patched"])).toBe("partial")
  })

  it("counts occurrences", () => {
    expect(occurrences("x-x-x", "x")).toBe(3)
    expect(occurrences("abc", "z")).toBe(0)
  })

  it("applies and reverts replacements exactly", () => {
    expect(applyReplacements(ORIGINAL_A, fileA)).toBe(PATCHED_A)
    expect(revertReplacements(PATCHED_A, fileA)).toBe(ORIGINAL_A)
  })

  it("refuses when the text does not occur the expected number of times", () => {
    expect(() => applyReplacements("min(20).max(90", fileA)).toThrow(
      new PatchError("count-mismatch", 'dist/a.js: expected 2 × "min(20).max(90", found 1'),
    )
    expect(() => revertReplacements(ORIGINAL_A, fileA)).toThrow(/expected 2 × "min\(1\)\.max\(90", found 0/)
    try {
      applyReplacements("", fileA)
    } catch (error) {
      expect([(error as PatchError).code, (error as PatchError).name]).toEqual(["count-mismatch", "PatchError"])
    }
  })
})
