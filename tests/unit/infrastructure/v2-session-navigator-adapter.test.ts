import { describe, expect, it } from "bun:test"
import { V2SessionNavigatorAdapter } from "@session-manager/infrastructure/adapters/outbound/tui/V2SessionNavigatorAdapter"
import { fakeTuiContext } from "@test/support/fakes/hosts"

// Spike S2 (`spike-results.md`): a deleted session rejects with
// `isSessionNotFoundError(err) === true`, `name` and `_tag` both
// "SessionNotFoundError". The adapter must read that shape as "missing".
function notFoundError(sessionID: string): Error {
  const error = new Error(`Session not found: ${sessionID}`)
  error.name = "SessionNotFoundError"
  ;(error as Error & { _tag: string })._tag = "SessionNotFoundError"
  return error
}

describe("V2SessionNavigatorAdapter", () => {
  it("[UC-R1] verify resolves exists when the session re-syncs", async () => {
    const adapter = new V2SessionNavigatorAdapter(fakeTuiContext())
    await expect(adapter.verify("ses_a")).resolves.toBe("exists")
  })

  it("[UC-R1] open navigates back to the session", () => {
    const context = fakeTuiContext()
    new V2SessionNavigatorAdapter(context).open("ses_a")
    expect(context.navigations).toEqual([{ type: "session", sessionID: "ses_a" }])
  })

  it("[UC-R1] notify shows the restored toast", () => {
    const context = fakeTuiContext()
    new V2SessionNavigatorAdapter(context).notify({
      variant: "success",
      title: "Session restored",
      message: "Restored ses_a after reconnect",
    })
    expect(context.toasts).toEqual([
      { variant: "success", title: "Session restored", message: "Restored ses_a after reconnect" },
    ])
  })

  it("[UC-R3N] verify reports missing for a SessionNotFoundError reject", async () => {
    const context = fakeTuiContext()
    context.data.session.sync = async () => {
      throw notFoundError("ses_gone")
    }
    const adapter = new V2SessionNavigatorAdapter(context)
    await expect(adapter.verify("ses_gone")).resolves.toBe("missing")
    expect(context.navigations).toEqual([])
    expect(context.toasts).toEqual([])
  })

  it("[UC-R4N] verify reports failed when sync throws anything else", async () => {
    const context = fakeTuiContext()
    context.data.session.sync = async () => {
      throw new Error("boom")
    }
    const adapter = new V2SessionNavigatorAdapter(context)
    await expect(adapter.verify("ses_a")).resolves.toBe("failed")
  })

  it("[UC-R5N] open and notify stay quiet once the route left home", () => {
    const context = fakeTuiContext()
    context.route = { type: "session", sessionID: "ses_a" }
    const adapter = new V2SessionNavigatorAdapter(context)
    adapter.open("ses_a")
    adapter.notify({
      variant: "success",
      title: "Session restored",
      message: "Restored ses_a after reconnect",
    })
    expect(context.navigations).toEqual([])
    expect(context.toasts).toEqual([])
  })

  it("[UC-R4N] verify reports failed when sync rejects without an error", async () => {
    const context = fakeTuiContext()
    context.data.session.sync = (): Promise<void> => Promise.reject("gone") as Promise<void>
    const adapter = new V2SessionNavigatorAdapter(context)
    await expect(adapter.verify("ses_a")).resolves.toBe("failed")
  })
})
