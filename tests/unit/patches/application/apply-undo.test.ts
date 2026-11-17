import { describe, expect, it } from "bun:test"
import type { PatchDefinition } from "@session-manager/domain/model/patches/Patch"
import { copy, encode, ORIGINAL_A, ORIGINAL_B, PATCHED_A, PATCHED_B, replacement, ROOT, sha, smallPatch } from "@test/support/patches/fakes"
import { world } from "@test/support/patches/world"

const A = `${ROOT}/dist/a.js`
const B = `${ROOT}/dist/b.js`

describe("ApplyUseCase", () => {
  it("backs up, patches and verifies every original file, and records it", async () => {
    const w = world()
    const report = await w.apply.apply({})
    expect(report.auditLog).toBe("/state/audit.log")
    expect(report.results).toEqual([
      {
        patch: "small",
        installation: { ...copy(), loaded: true },
        outcome: "applied",
        reason: null,
        files: [
          { path: "dist/a.js", from: sha(ORIGINAL_A), to: sha(PATCHED_A) },
          { path: "dist/b.js", from: sha(ORIGINAL_B), to: sha(PATCHED_B) },
        ],
      },
    ])
    expect([w.files.text(A), w.files.text(B)]).toEqual([PATCHED_A, PATCHED_B])
    expect([...w.backups.stored.keys()]).toEqual([`1.0.0/small/dist/a.js@${sha(ORIGINAL_A)}`, `1.0.0/small/dist/b.js@${sha(ORIGINAL_B)}`])
    expect(w.audit.records.map((r) => [r.action, r.path, r.outcome, r.backup !== null, r.time])).toEqual([
      ["apply", "dist/a.js", "applied", true, "2026-10-11T12:00:00.000Z"],
      ["apply", "dist/b.js", "applied", true, "2026-10-11T12:00:00.000Z"],
    ])
  })

  it("changes nothing when already applied, and finishes a partial patch", async () => {
    const w = world()
    w.files.contents.set(A, encode(PATCHED_A))
    expect((await w.apply.apply({})).results[0]!.files).toEqual([{ path: "dist/b.js", from: sha(ORIGINAL_B), to: sha(PATCHED_B) }])
    w.files.replaces = []
    const again = (await w.apply.apply({})).results[0]!
    expect([again.outcome, w.files.replaces]).toEqual(["already-applied", []])
  })

  it("refuses an unchecked version, a missing file, and a file changed some other way", async () => {
    const w = world()
    w.installations.copies = [copy("2.0.0", "1.0.0")]
    expect((await w.apply.apply({})).results[0]!.reason).toBe(
      "small has not been checked against Magic Context 2.0.0; review it with `inspect --version 2.0.0`",
    )
    w.installations.copies = [copy()]
    w.files.contents.delete(B)
    expect((await w.apply.apply({})).results[0]!.reason).toBe("dist/b.js is missing")
    w.files.contents.set(B, encode("edited by hand"))
    const changed = (await w.apply.apply({})).results[0]!
    expect([changed.outcome, changed.reason]).toEqual(["refused", `dist/b.js matches neither recorded checksum (sha256 ${sha("edited by hand")})`])
    expect(w.files.replaces).toEqual([])
    expect(w.audit.records.map((r) => r.outcome)).toEqual(["refused", "refused", "refused", "refused", "refused"])
  })

  it("refuses when the text is not found the expected number of times, or the result has another checksum", async () => {
    const wrongCount: PatchDefinition = {
      ...smallPatch,
      releases: [{ version: "1.0.0", files: [{ ...smallPatch.releases[0]!.files[0]!, replacements: [replacement(5)] }] }],
    }
    const w1 = world([wrongCount])
    expect((await w1.apply.apply({})).results[0]!.reason).toBe('dist/a.js: expected 5 × "min(20).max(90", found 2')
    const wrongAfter: PatchDefinition = {
      ...smallPatch,
      releases: [{ version: "1.0.0", files: [{ ...smallPatch.releases[0]!.files[0]!, after: sha("something else") }] }],
    }
    const w2 = world([wrongAfter])
    expect((await w2.apply.apply({})).results[0]!.reason).toBe(
      `dist/a.js: the patched result has sha256 ${sha(PATCHED_A)}, not the recorded ${sha("something else")}`,
    )
    expect([w1.files.replaces, w2.files.replaces]).toEqual([[], []])
  })

  it("puts every written file back when a later write fails", async () => {
    const w = world()
    w.files.failReplace.add(B)
    const result = (await w.apply.apply({})).results[0]!
    expect([result.outcome, result.reason]).toEqual(["failed", `cannot write ${B}`])
    expect([w.files.text(A), w.files.text(B), w.files.replaces]).toEqual([ORIGINAL_A, ORIGINAL_B, [A, B, A]])
    expect(result.files.map((f) => f.to)).toEqual([sha(ORIGINAL_A), sha(ORIGINAL_B)])
  })

  it("puts the file back when it reads back with another checksum, and reports a failed restore", async () => {
    const w = world()
    w.files.corruptReplace.add(A)
    const result = (await w.apply.apply({})).results[0]!
    expect([result.reason, w.files.text(A)]).toEqual([`dist/a.js: read back ${sha("corrupted")}, expected ${sha(PATCHED_A)}`, "corrupted"])
    // The first write of a.js lands corrupted; putting the original back then fails too.
    const restore = world()
    restore.files.corruptReplace.add(A)
    const replace = restore.files.replace.bind(restore.files)
    restore.files.replace = async (file, bytes) => {
      await replace(file, bytes)
      restore.files.failReplace.add(A)
    }
    const failed = (await restore.apply.apply({})).results[0]!
    expect(failed.reason).toBe(
      `dist/a.js: read back ${sha("corrupted")}, expected ${sha(PATCHED_A)}; restoring dist/a.js failed: cannot write ${A}`,
    )
  })

  it("reports a file that vanished while being written", async () => {
    const w = world()
    const replace = w.files.replace.bind(w.files)
    w.files.replace = async (file, bytes) => {
      await replace(file, bytes)
      w.files.contents.delete(file)
    }
    expect((await w.apply.apply({})).results[0]!.reason).toStartWith(`dist/a.js: read back null, expected ${sha(PATCHED_A)}`)
  })
})

describe("UndoUseCase", () => {
  it("restores the originals from the backups apply took", async () => {
    const w = world()
    await w.apply.apply({})
    const result = (await w.undo.undo({})).results[0]!
    expect([result.outcome, w.files.text(A), w.files.text(B)]).toEqual(["reverted", ORIGINAL_A, ORIGINAL_B])
    expect(w.audit.records.slice(2).map((r) => [r.action, r.outcome, r.backup])).toEqual([
      ["undo", "reverted", null],
      ["undo", "reverted", null],
    ])
  })

  it("reverses the replacements when there is no intact backup", async () => {
    const w = world()
    w.files.contents.set(A, encode(PATCHED_A))
    w.files.contents.set(B, encode(PATCHED_B))
    w.backups.stored.set(`1.0.0/small/dist/a.js@${sha(ORIGINAL_A)}`, encode("damaged backup"))
    const report = await w.undo.undo({})
    expect([report.results[0]!.outcome, w.files.text(A), w.files.text(B), report.auditLog]).toEqual([
      "reverted",
      ORIGINAL_A,
      ORIGINAL_B,
      "/state/audit.log",
    ])
  })

  it("changes nothing when already original, and refuses what it cannot rebuild exactly", async () => {
    const w = world()
    expect((await w.undo.undo({})).results[0]!.outcome).toBe("already-original")
    w.files.contents.set(A, encode("other"))
    expect((await w.undo.undo({})).results[0]!.outcome).toBe("refused")

    // A patched file whose replacement cannot be reversed back to the recorded original.
    const odd = 'x min(1).max(90 y\n'
    const unreachable: PatchDefinition = {
      ...smallPatch,
      releases: [{ version: "1.0.0", files: [{ path: "dist/a.js", before: sha("never"), after: sha(odd), replacements: [replacement(1)] }] }],
    }
    const w2 = world([unreachable])
    w2.files.contents.set(A, encode(odd))
    expect((await w2.undo.undo({})).results[0]!.reason).toBe(
      `dist/a.js: no intact backup and the replacements cannot be reversed to sha256 ${sha("never")}`,
    )
    const uncountable: PatchDefinition = {
      ...unreachable,
      releases: [{ version: "1.0.0", files: [{ ...unreachable.releases[0]!.files[0]!, replacements: [replacement(4)] }] }],
    }
    const w3 = world([uncountable])
    w3.files.contents.set(A, encode(odd))
    expect((await w3.undo.undo({})).results[0]!.outcome).toBe("refused")
  })
})
