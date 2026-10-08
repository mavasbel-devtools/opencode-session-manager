import { describe, expect, it } from "bun:test"
import { createServerContainer } from "@session-id/main/server-container"
import { createTuiContainer } from "@session-id/main/tui-container"
import { fakeServerContext, fakeTuiContext } from "@test/support/fakes/hosts"

describe("createServerContainer", () => {
  it("wires a tool adapter that answers a session-id call", async () => {
    const context = fakeServerContext()
    await createServerContainer().tool.register(context)
    expect(context.added.map((tool) => tool.name)).toEqual(["session-id"])
    expect(await context.added[0]!.execute({}, { sessionID: "ses_7" })).toEqual({ content: "ses_7" })
  })
})

describe("createTuiContainer", () => {
  it("wires a sidebar adapter that claims sidebar.content and renders", () => {
    const context = fakeTuiContext("#808080")
    const cleanup = createTuiContainer().sidebar.register(context)
    expect(context.claims[0]!.prepend).toBe("sidebar.content")
    // Painting needs a renderer, so it is proven in tests/component and tests/live.
    expect(typeof context.claims[0]!.render).toBe("function")
    cleanup()
    expect(context.disposed).toHaveLength(1)
  })
})
