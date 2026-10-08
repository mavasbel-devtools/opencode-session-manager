import { describe, expect, it } from "bun:test"
import { V2_PLUGIN_ID } from "@session-manager/main/plugin-id"
import server, { setup as serverSetup } from "@session-manager/main/v2/server"
import tui, { setup as tuiSetup } from "@session-manager/main/v2/tui"
import { fakeServerContext, fakeTuiContext } from "@test/support/fakes/hosts"

describe("v2 entry modules", () => {
  it("both export the plugin shape the v2.0.14 host accepts", () => {
    for (const plugin of [server, tui]) {
      expect(typeof plugin.id).toBe("string")
      expect(plugin.id).toBe(V2_PLUGIN_ID)
      expect(typeof plugin.setup).toBe("function")
    }
  })

  it("uses the merged plugin's id", () => {
    expect(V2_PLUGIN_ID).toBe("session-manager")
  })

  it("registers the tool from the server entry", async () => {
    const context = fakeServerContext()
    await serverSetup(context)
    expect(context.added.map((tool) => tool.name)).toEqual(["session-id"])
  })

  it("registers the sidebar line and the transfer command from the TUI entry, and one disposer removes both", () => {
    const context = fakeTuiContext()
    const cleanup = tuiSetup(context)
    expect(context.claims.map((claim) => claim.prepend)).toEqual(["sidebar.content"])
    expect(context.appClaims.map((claim) => claim.append)).toEqual(["app"])
    cleanup()
    expect(context.disposed).toHaveLength(2)
  })
})
