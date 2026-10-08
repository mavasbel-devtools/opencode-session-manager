import { describe, expect, it } from "bun:test"
import { loadEverySource, platformOf } from "@test/support/source-files"

describe("coverage completeness (e2e tier)", () => {
  it("loads every src file of this platform so none escapes the per-file coverage gate", async () => {
    const loaded = await loadEverySource(process.platform)
    expect(loaded.length).toBeGreaterThan(0)
    expect(loaded.filter((file) => { const own = platformOf(file); return own !== undefined && own !== process.platform })).toEqual([])
  })
})
