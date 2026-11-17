import { describe, expect, it } from "bun:test"
import {
  decideRestore,
  RESTORE_LIMIT,
  RESTORE_WINDOW_MS,
  VERIFY_BACKOFF,
  WINDOW,
} from "@session-manager/domain/model/ReconnectRestore"
import type {
  RestoreState,
  RouteSample,
} from "@session-manager/domain/model/ReconnectRestore"

// The pure trigger rule behind F3: session S → home within WINDOW of a
// `server.connected` (either order — S1 saw connected-first, the rule also
// covers connected-after) starts a verify; the async verify loop itself lives
// in the application use case, which feeds the outcome back as `verified`.
const session = (sessionID: string): RouteSample => ({ type: "session", sessionID })
const home: RouteSample = { type: "home" }

function emptyState(): RestoreState {
  return { lastSession: undefined, lastConnected: undefined, deleted: new Set<string>(), restoresBySession: [] }
}

/** Session S on screen, a reconnect, then home — the RC-3 shape. */
function homeAfterReconnect(state: RestoreState, sessionID: string, connectedAt: number, homeAt: number) {
  const seen = decideRestore(state, { kind: "route", route: session(sessionID), at: connectedAt - 100 })
  const linked = decideRestore(seen.state, { kind: "connected", at: connectedAt })
  return decideRestore(linked.state, { kind: "route", route: home, at: homeAt })
}

describe("ReconnectRestore constants", () => {
  it("fixes the reconnect-adjacency window, the loop guard and the verify backoff", () => {
    expect(WINDOW).toBe(10000)
    expect(RESTORE_LIMIT).toBe(3)
    expect(RESTORE_WINDOW_MS).toBe(60000)
    expect(VERIFY_BACKOFF).toEqual([500, 1000, 2000, 4000, 8000])
  })
})

describe("decideRestore", () => {
  it("[UC-R1] verifies when home follows a reconnect within WINDOW", () => {
    const decision = homeAfterReconnect(emptyState(), "ses_a", 1000, 2000)
    expect(decision.action).toEqual({ verify: "ses_a" })
  })

  it("[UC-R1] verifies when the reconnect lands just after home (reverse order)", () => {
    const seen = decideRestore(emptyState(), { kind: "route", route: session("ses_a"), at: 1000 })
    const left = decideRestore(seen.state, { kind: "route", route: home, at: 2000 })
    expect(left.action).toBe("none")
    const linked = decideRestore(left.state, { kind: "connected", at: 5000 })
    expect(linked.action).toEqual({ verify: "ses_a" })
  })

  it("[UC-R1] navigates back once verify reports the session exists", () => {
    const pending = homeAfterReconnect(emptyState(), "ses_a", 1000, 2000)
    expect(pending.action).toEqual({ verify: "ses_a" })
    const done = decideRestore(pending.state, {
      kind: "verified",
      sessionID: "ses_a",
      result: "exists",
      at: 2500,
    })
    expect(done.action).toEqual({ navigate: "ses_a" })
    expect(done.state.restoresBySession).toHaveLength(1)
  })

  it("[UC-R1] treats the WINDOW edge as adjacent", () => {
    const decision = homeAfterReconnect(emptyState(), "ses_a", 1000, 1000 + WINDOW)
    expect(decision.action).toEqual({ verify: "ses_a" })
  })

  it("[UC-R2N] stays silent when home has no recent reconnect", () => {
    const seen = decideRestore(emptyState(), { kind: "route", route: session("ses_a"), at: 1000 })
    const left = decideRestore(seen.state, { kind: "route", route: home, at: 2000 })
    expect(left.action).toBe("none")
  })

  it("[UC-R2N] stays silent when the reconnect is older than WINDOW", () => {
    const decision = homeAfterReconnect(emptyState(), "ses_a", 1000, 1000 + WINDOW + 1)
    expect(decision.action).toBe("none")
  })

  it("[UC-R2N] stays silent when the reconnect arrives after WINDOW", () => {
    const seen = decideRestore(emptyState(), { kind: "route", route: session("ses_a"), at: 1000 })
    const left = decideRestore(seen.state, { kind: "route", route: home, at: 2000 })
    const late = decideRestore(left.state, { kind: "connected", at: 2000 + WINDOW + 1 })
    expect(late.action).toBe("none")
  })

  it("[UC-R3N] stays silent for a deleted session", () => {
    const gone = decideRestore(emptyState(), { kind: "deleted", sessionID: "ses_a" })
    const decision = homeAfterReconnect(gone.state, "ses_a", 1000, 2000)
    expect(decision.action).toBe("none")
  })

  it("[UC-R3N] stays silent when verify reports the session missing", () => {
    const pending = homeAfterReconnect(emptyState(), "ses_a", 1000, 2000)
    const done = decideRestore(pending.state, {
      kind: "verified",
      sessionID: "ses_a",
      result: "missing",
      at: 2500,
    })
    expect(done.action).toBe("none")
    expect(done.state.restoresBySession).toHaveLength(0)
  })

  it("[UC-R4N] retries verify until VERIFY_BACKOFF is exhausted, then gives up", () => {
    let state = homeAfterReconnect(emptyState(), "ses_a", 1000, 2000).state
    for (let attempt = 1; attempt < VERIFY_BACKOFF.length; attempt++) {
      const retry = decideRestore(state, {
        kind: "verified",
        sessionID: "ses_a",
        result: "failed",
        at: 2000 + attempt,
      })
      expect(retry.action).toEqual({ verify: "ses_a" })
      state = retry.state
    }
    const giveUp = decideRestore(state, {
      kind: "verified",
      sessionID: "ses_a",
      result: "failed",
      at: 9000,
    })
    expect(giveUp.action).toEqual({ giveUp: "ses_a" })
    expect(giveUp.state.restoresBySession).toHaveLength(0)
  })

  it("[UC-R5N] aborts when the route leaves home during verify", () => {
    const pending = homeAfterReconnect(emptyState(), "ses_a", 1000, 2000)
    expect(pending.action).toEqual({ verify: "ses_a" })
    const back = decideRestore(pending.state, { kind: "route", route: session("ses_a"), at: 2500 })
    expect(back.action).toBe("none")
    const late = decideRestore(back.state, {
      kind: "verified",
      sessionID: "ses_a",
      result: "exists",
      at: 2600,
    })
    expect(late.action).toBe("none")
  })

  it("[UC-R6N] refuses another restore once RESTORE_LIMIT is reached", () => {
    const state: RestoreState = {
      ...emptyState(),
      restoresBySession: [
        { sessionID: "ses_a", at: 59000 },
        { sessionID: "ses_a", at: 58000 },
        { sessionID: "ses_a", at: 57000 },
      ],
    }
    const decision = homeAfterReconnect(state, "ses_a", 60000, 61000)
    expect(decision.action).toBe("none")
  })

  it("[UC-R6N] forgets restores older than RESTORE_WINDOW_MS", () => {
    const state: RestoreState = {
      ...emptyState(),
      restoresBySession: [
        { sessionID: "ses_a", at: 0 },
        { sessionID: "ses_a", at: 1000 },
        { sessionID: "ses_a", at: 2000 },
      ],
    }
    const decision = homeAfterReconnect(state, "ses_a", 70000, 71000)
    expect(decision.action).toEqual({ verify: "ses_a" })
  })

  it("[UC-R7N] ignores a session-to-session route change", () => {
    const seen = decideRestore(emptyState(), { kind: "route", route: session("ses_a"), at: 1000 })
    const linked = decideRestore(seen.state, { kind: "connected", at: 1500 })
    const moved = decideRestore(linked.state, { kind: "route", route: session("ses_b"), at: 2000 })
    expect(moved.action).toBe("none")
  })
})
