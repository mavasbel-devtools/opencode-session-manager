import { describe, expect, it } from "bun:test"
import { SessionIdSidebarSlotV2Adapter } from "@session-id/infrastructure/adapters/inbound/tui/SessionIdSidebarSlotV2Adapter"
import { fakeRenderer, fakeTuiContext } from "@test/support/fakes/hosts"

describe("SessionIdSidebarSlotV2Adapter", () => {
  it("claims sidebar.content exactly once, as a prepend", () => {
    const context = fakeTuiContext()
    new SessionIdSidebarSlotV2Adapter(() => fakeRenderer()).register(context)
    expect(context.claims).toHaveLength(1)
    expect(Object.keys(context.claims[0]!).sort()).toEqual(["prepend", "render"])
    expect(context.claims[0]!.prepend).toBe("sidebar.content")
  })

  it("builds the renderer from the registered context", () => {
    const context = fakeTuiContext()
    const seen: unknown[] = []
    new SessionIdSidebarSlotV2Adapter((registered) => {
      seen.push(registered)
      return fakeRenderer()
    }).register(context)
    expect(seen).toEqual([context])
  })

  it("renders through the renderer with the host's slot input", () => {
    const context = fakeTuiContext()
    const renderer = fakeRenderer()
    new SessionIdSidebarSlotV2Adapter(() => renderer).register(context)
    expect(context.claims[0]!.render({ sessionID: "ses_5" })).toBe("rendered:ses_5")
    expect(renderer.inputs).toEqual([{ sessionID: "ses_5" }])
  })

  it("returns the host's disposer so the claim is removed on cleanup", () => {
    const context = fakeTuiContext()
    const cleanup = new SessionIdSidebarSlotV2Adapter(() => fakeRenderer()).register(context)
    expect(context.disposed).toHaveLength(0)
    cleanup()
    expect(context.disposed).toEqual(context.claims)
  })
})
