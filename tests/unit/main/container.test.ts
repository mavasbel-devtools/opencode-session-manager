import { describe, expect, it } from "bun:test"
import { createServerContainer } from "@session-manager/main/server-container"
import { createTuiContainer } from "@session-manager/main/tui-container"
import { fakeServerContext, fakeTuiContext } from "@test/support/fakes/hosts"
import { startFakeHerdr } from "@test/support/fakes/herdr-socket"

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
    const cleanup = createTuiContainer(context.client, {}, "linux").sidebar.register(context)
    expect(context.claims[0]!.prepend).toBe("sidebar.content")
    // Painting needs a renderer, so it is proven in tests/component and tests/live.
    expect(typeof context.claims[0]!.render).toBe("function")
    cleanup()
    expect(context.disposed).toHaveLength(1)
  })

  it("wires the transfer command through an app slot, with no SQLite access", () => {
    const context = fakeTuiContext()
    const cleanup = createTuiContainer(context.client, {}, "linux").transfer.register(context)
    expect(context.appClaims.map((claim) => claim.append)).toEqual(["app"])
    expect(context.appClaims[0]!.render()).toBeNull()
    expect(context.layers[0]!().commands.map((command) => command.id)).toEqual(["session.transfer"])
    cleanup()
    expect(context.disposed).toHaveLength(1)
  })

  it("wires no pane title outside Herdr", () => {
    expect(createTuiContainer(fakeTuiContext().client, {}, "linux").paneTitle).toBeUndefined()
  })

  it("inside Herdr, wires a pane title that reports the open session's title to the pane's socket", async () => {
    const herdr = await startFakeHerdr()
    try {
      const context = fakeTuiContext()
      context.sessions.set("ses_a", { id: "ses_a", title: "Lean Formalization" })
      context.route = { type: "session", sessionID: "ses_a" }
      const environment = { HERDR_ENV: "1", HERDR_SOCKET_PATH: herdr.socketPath, HERDR_PANE_ID: "w2:p3" }
      const cleanup = createTuiContainer(context.client, environment, "linux").paneTitle!.register(context)
      while (herdr.requests.length === 0) await Bun.sleep(10)
      cleanup()
      while (herdr.requests.length === 1) await Bun.sleep(10)
      expect(herdr.requests.map((request) => [request.params["pane_id"], request.params["title"] ?? "cleared"])).toEqual([
        ["w2:p3", "Lean Formalization"],
        ["w2:p3", "cleared"],
      ])
    } finally {
      await herdr.stop()
    }
  })
})
