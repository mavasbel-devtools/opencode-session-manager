import { describe, expect, it } from "bun:test"
import { V2ResyncRouteAdapter } from "@session-manager/infrastructure/adapters/outbound/tui/V2ResyncRouteAdapter"
import { fakeTuiContext } from "@test/support/fakes/hosts"

// F11 — the outbound read the retry makes: which session the route shows, and
// whether the host's synced data holds a session once the retries end.
describe("V2ResyncRouteAdapter", () => {
  it("[UC-RR1] reports the session the route shows", () => {
    const context = fakeTuiContext()
    context.route = { type: "session", sessionID: "ses_a" }
    expect(new V2ResyncRouteAdapter(context).routedSessionID()).toBe("ses_a")
  })

  it("[UC-RR7N] reports nothing while the route is home", () => {
    const context = fakeTuiContext()
    expect(new V2ResyncRouteAdapter(context).routedSessionID()).toBeUndefined()
  })

  it("[UC-RR7N] reports nothing for a route that is not a session", () => {
    const context = fakeTuiContext()
    context.route = { type: "unknown" }
    expect(new V2ResyncRouteAdapter(context).routedSessionID()).toBeUndefined()
  })

  it("[UC-RR6N] reports a session loaded only once the host's synced data holds it", () => {
    const context = fakeTuiContext()
    const adapter = new V2ResyncRouteAdapter(context)
    expect(adapter.isLoaded("ses_a")).toBe(false)

    context.sessions.set("ses_a", { id: "ses_a", title: "Lean Formalization" })
    expect(adapter.isLoaded("ses_a")).toBe(true)
    expect(adapter.isLoaded("ses_b")).toBe(false)
  })
})
