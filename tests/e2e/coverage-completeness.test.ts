import { describe, expect, it } from "bun:test"
import { loadEverySource } from "@test/support/source-files"

describe("coverage completeness (live tier)", () => {
  it("loads every src file so none escapes the per-file coverage gate", async () => {
    expect((await loadEverySource()).length).toBeGreaterThan(0)
  })
})
