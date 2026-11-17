import { describe, expect, it } from "bun:test"
import { copy, PATCHED_A, PATCHED_B, ROOT, sha } from "@test/support/patches/fakes"
import { world } from "@test/support/patches/world"

describe("StatusUseCase", () => {
  it("reports each patch on each copy, with each file's state and checksum", async () => {
    const w = world()
    w.installations.copies = [copy(), copy("2.0.0", "2.0.0", "/new")]
    const report = await w.status.status()
    expect(report.patches.map((p) => [p.installation.version, p.state])).toEqual([
      ["1.0.0", "not-applied"],
      ["2.0.0", "unchecked-version"],
    ])
    expect(report.patches[0]!.files.map((f) => f.state)).toEqual(["original", "original"])
    expect(report.patches.map((p) => p.checked)).toEqual(["reviewed", null])
  })

  it("compares a version follow derived with its stored release, marked auto-checked", async () => {
    const w = world()
    w.installations.copies = [copy("2.0.0", "2.0.0", "/new")]
    w.files.contents.set("/new/dist/b.js", new TextEncoder().encode(PATCHED_B))
    const file = { path: "dist/b.js", before: sha("x"), after: sha(PATCHED_B), replacements: [] }
    w.derived.releases = [
      { patch: "other", release: { version: "2.0.0", files: [] } },
      { patch: "small", release: { version: "3.0.0", files: [] } },
      { patch: "small", release: { version: "2.0.0", files: [file] } },
    ]
    const [status] = (await w.status.status()).patches
    expect([status!.state, status!.checked, status!.files]).toEqual(["applied", "auto", [{ path: "dist/b.js", state: "patched", sha: sha(PATCHED_B) }]])
  })
})

describe("CheckUseCase", () => {
  it("passes only when every patch is applied on the loaded copy", async () => {
    const w = world()
    expect(await w.check.check()).toEqual({
      ok: false,
      loadedSpec: "1.0.0",
      reason: null,
      problems: [{ patch: "small", version: "1.0.0", root: ROOT, state: "not-applied" }],
    })
    w.files.contents.set(`${ROOT}/dist/a.js`, new TextEncoder().encode(PATCHED_A))
    w.files.contents.set(`${ROOT}/dist/b.js`, new TextEncoder().encode(PATCHED_B))
    expect((await w.check.check()).ok).toBe(true)
    expect(sha(PATCHED_A)).toBe(w.hash.sha256(w.files.contents.get(`${ROOT}/dist/a.js`)!))
  })

  it("fails with a reason when nothing is configured or the configured copy is not installed", async () => {
    const w = world()
    w.config.text = "{}"
    expect(await w.check.check()).toEqual({ ok: false, loadedSpec: null, reason: "Magic Context is not configured in opencode.jsonc", problems: [] })
    w.config.text = '"@cortexkit/opencode-magic-context@9.9.9"'
    expect((await w.check.check()).reason).toBe("Magic Context 9.9.9 is configured but not installed yet (start OpenCode once)")
  })
})
