import { describe, expect, it } from "bun:test"
import { V2_PLUGIN_ID } from "@session-id/main/plugin-id"
import server, { setup as serverSetup } from "@session-id/main/v2/server"
import tui, { setup as tuiSetup } from "@session-id/main/v2/tui"
import { fakeServerContext, fakeTuiContext } from "@test/support/fakes/hosts"

describe("v2 entry modules", () => {
  it("both export the plugin shape the v2.0.14 host accepts", () => {
    for (const plugin of [server, tui]) {
      expect(typeof plugin.id).toBe("string")
      expect(plugin.id).toBe(V2_PLUGIN_ID)
      expect(typeof plugin.setup).toBe("function")
    }
  })

  it("keeps the plugin id of the hand-written plugin it replaces", () => {
    expect(V2_PLUGIN_ID).toBe("session-id-tool")
  })

  it("registers the tool from the server entry", async () => {
    const context = fakeServerContext()
    await serverSetup(context)
    expect(context.added.map((tool) => tool.name)).toEqual(["session-id"])
  })

  it("registers the sidebar claim from the TUI entry and returns its disposer", () => {
    const context = fakeTuiContext()
    const cleanup = tuiSetup(context)
    expect(context.claims[0]!.prepend).toBe("sidebar.content")
    cleanup()
    expect(context.disposed).toHaveLength(1)
  })
})
