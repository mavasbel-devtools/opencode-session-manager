import { describe, expect, it } from "bun:test"
import { PatchInspector } from "@session-manager/application/patches/PatchInspector"
import { ReleaseCatalog } from "@session-manager/application/patches/ReleaseCatalog"
import type { PatchDefinition } from "@session-manager/domain/model/patches/Patch"
import { FakeDerived, FakeFiles, FakeHash, ORIGINAL_A, ORIGINAL_B, PATCHED_A, PATCHED_B, ROOT, sha, smallPatch } from "@test/support/patches/fakes"

/** A second patch that changes the same file, so the file on disk holds its result. */
const later: PatchDefinition = {
  ...smallPatch,
  id: "later",
  releases: [
    {
      version: "1.0.0",
      files: [{ path: "dist/a.js", before: sha(PATCHED_A), after: sha(`${PATCHED_A}// later`), replacements: [] }],
    },
  ],
}

const INSTALLATION = { spec: "1.0.0", root: ROOT, version: "1.0.0", loaded: true }

const other: PatchDefinition = { ...smallPatch, id: "other", releases: [{ version: "1.0.0", files: [{ ...smallPatch.releases[0]!.files[0]! }] }] }

function inspector(patches: readonly PatchDefinition[], contents: Record<string, string>) {
  const derived = new FakeDerived()
  for (const patch of patches) for (const release of patch.releases) derived.releases.push({ patch: patch.id, release })
  return { patchInspector: new PatchInspector(new FakeFiles(contents), new FakeHash(), new ReleaseCatalog(derived), patches), derived }
}

describe("PatchInspector", () => {
  it("finds the releases later patches give the same file, and none for a patch it does not know", async () => {
    const { patchInspector } = inspector([smallPatch, later], {})
    expect(await patchInspector.later("1.0.0", "dist/a.js", smallPatch)).toEqual([sha(`${PATCHED_A}// later`)])
    expect(await patchInspector.later("1.0.0", "dist/b.js", smallPatch)).toEqual([])
    expect(await patchInspector.later("1.0.0", "dist/a.js", later)).toEqual([])
    expect(await patchInspector.later("1.0.0", "dist/a.js", other)).toEqual([])
    expect(await patchInspector.later("9.9.9", "dist/a.js", smallPatch)).toEqual([])
    expect(await patchInspector.earlier("1.0.0", "dist/a.js", later)).toEqual([sha(ORIGINAL_A)])
    expect(await patchInspector.earlier("1.0.0", "dist/a.js", smallPatch)).toEqual([])
    expect(await patchInspector.earlier("1.0.0", "dist/a.js", other)).toEqual([])
  })

  it("reads a file a later patch has already changed as patched, and an untouched file as original", async () => {
    const { patchInspector } = inspector([smallPatch, later], {
      [`${ROOT}/dist/a.js`]: `${PATCHED_A}// later`,
      [`${ROOT}/dist/b.js`]: ORIGINAL_B,
    })
    const [a, b] = (await patchInspector.readAll(INSTALLATION, smallPatch))!
    expect([a!.status.state, b!.status.state]).toEqual(["patched", "original"])
    expect((await patchInspector.status(INSTALLATION, smallPatch)).state).toBe("partial")
    const both = inspector([smallPatch, later], { [`${ROOT}/dist/a.js`]: `${PATCHED_A}// later`, [`${ROOT}/dist/b.js`]: PATCHED_B })
    expect((await both.patchInspector.status(INSTALLATION, smallPatch)).state).toBe("applied")
  })
})
