import { describe, expect, it } from "bun:test"
import { PatchError } from "@session-manager/domain/errors/PatchError"
import { copy } from "@test/support/patches/fakes"
import { world } from "@test/support/patches/world"

describe("InstallationCatalog", () => {
  it("marks the copy opencode.jsonc pins as loaded", async () => {
    const w = world()
    w.installations.copies = [copy("0.9.0", "0.9.0", "/old"), copy()]
    const catalog = await w.catalog.load()
    expect([catalog.loadedSpec, catalog.installations.map((i) => i.loaded)]).toEqual(["1.0.0", [false, true]])
  })

  it("loads nothing as pinned when the configuration file is absent", async () => {
    const w = world()
    w.config.text = null
    expect((await w.catalog.load()).loadedSpec).toBeNull()
  })

  it("targets every patch on the loaded copy, or on the copies of a named version", async () => {
    const w = world()
    w.installations.copies = [copy("0.9.0", "0.9.0", "/old"), copy()]
    expect((await w.catalog.targets({})).map((t) => t.installation.root)).toEqual(["/cache/mc@1.0.0/node_modules/@cortexkit/opencode-magic-context"])
    expect((await w.catalog.targets({ version: "0.9.0", patch: "small" })).map((t) => t.installation.root)).toEqual(["/old"])
  })

  it("refuses an unknown patch, and missing installations", async () => {
    const w = world()
    await expect(w.catalog.targets({ patch: "nope" })).rejects.toThrow(new PatchError("usage", "unknown patch nope; known: small"))
    await expect(w.catalog.targets({ version: "3.0.0" })).rejects.toThrow("Magic Context 3.0.0 is not installed")
    w.config.text = "{}"
    await expect(w.catalog.targets({})).rejects.toThrow("no installed Magic Context for the configured spec (none: not in opencode.jsonc)")
    w.config.text = '["@cortexkit/opencode-magic-context@2.0.0"]'
    await expect(w.catalog.targets({})).rejects.toThrow("no installed Magic Context for the configured spec 2.0.0")
  })
})
