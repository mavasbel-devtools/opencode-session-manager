import { describe, it, expect } from "bun:test"
import plugin from "@transfer/main/plugin-entry"

describe("plugin-entry", () => {
  it("exposes a server plugin that returns an empty hook set", async () => {
    const hooks = await plugin({} as any)
    expect(hooks).toEqual({})
  })
})
