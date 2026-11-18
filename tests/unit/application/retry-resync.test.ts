import { describe, expect, it } from "bun:test"
import { RetryResyncUseCase } from "@session-manager/application/RetryResyncUseCase"
import { RESYNC_BACKOFF } from "@session-manager/domain/model/ResyncRetry"
import type { ResyncRequest } from "@session-manager/domain/model/ResyncRetry"
import type { RetryResyncPort } from "@session-manager/domain/ports/inbound/RetryResyncPort"
import type { ResyncRoutePort } from "@session-manager/domain/ports/outbound/ResyncRoutePort"
import type { TimerPort } from "@session-manager/domain/ports/outbound/TimerPort"

// F11 — the retry loop behind one re-sync: six attempts over RESYNC_BACKOFF,
// only for a transient transport failure or a 503, never for a missing
// session, stopping the moment the route leaves the session.
type Outcome = "ok" | Error

/** Outbound stand-in: the open route and the synced sessions, in memory. */
class FakeRoute implements ResyncRoutePort {
  routed: string | undefined
  readonly loaded = new Set<string>()

  constructor(routed?: string) {
    this.routed = routed
  }

  routedSessionID(): string | undefined {
    return this.routed
  }

  isLoaded(sessionID: string): boolean {
    return this.loaded.has(sessionID)
  }
}

/** Timer stand-in: records every delay and never waits; a test can hook a sleep. */
class FakeTimer implements TimerPort {
  readonly sleeps: number[] = []
  onSleep: (() => void) | undefined

  async sleep(milliseconds: number): Promise<void> {
    this.sleeps.push(milliseconds)
    this.onSleep?.()
  }
}

/** The attempt under test: hands out the scripted outcomes in order. */
class ScriptedAttempt {
  calls = 0
  private readonly outcomes: Outcome[]

  constructor(outcomes: Outcome[]) {
    this.outcomes = [...outcomes]
  }

  readonly run = async (): Promise<void> => {
    this.calls++
    const outcome = this.outcomes.shift() ?? "ok"
    if (outcome !== "ok") throw outcome
  }
}

function statusError(status: number): Error {
  const error = new Error(`UnexpectedStatus: ${status}`)
  error.name = "ClientError"
  ;(error as Error & { cause?: { status: number } }).cause = { status }
  return error
}

function notFoundError(sessionID: string): Error {
  const error = new Error(`Session not found: ${sessionID}`)
  error.name = "SessionNotFoundError"
  return error
}

/** `routed` is `null` for a home route: `undefined` would select the default and mean "on ses_a". */
function setup(outcomes: Outcome[], routed: string | null = "ses_a") {
  const route = new FakeRoute(routed ?? undefined)
  const timer = new FakeTimer()
  const useCase: RetryResyncPort = new RetryResyncUseCase(route, timer)
  const attempt = new ScriptedAttempt(outcomes)
  const request: ResyncRequest = { sessionID: "ses_a", children: true }
  return { route, timer, useCase, attempt, request }
}

describe("RetryResyncUseCase", () => {
  it("[UC-RR1] resolves on the first attempt without waiting", async () => {
    const { timer, useCase, attempt, request } = setup(["ok"])
    await expect(useCase.sync(request, attempt.run)).resolves.toBeUndefined()
    expect(attempt.calls).toBe(1)
    expect(timer.sleeps).toEqual([])
  })

  it("[UC-RR1] retries a 503 twice, then resolves with the backoff it waited", async () => {
    const { timer, useCase, attempt, request } = setup([statusError(503), statusError(503), "ok"])
    await expect(useCase.sync(request, attempt.run)).resolves.toBeUndefined()
    expect(attempt.calls).toBe(3)
    expect(timer.sleeps).toEqual([500, 1000])
  })

  it("[UC-RR6N] makes six attempts over RESYNC_BACKOFF, then rethrows the last error", async () => {
    const errors = Array.from({ length: 6 }, () => statusError(503))
    const { timer, useCase, attempt, request } = setup(errors)
    await expect(useCase.sync(request, attempt.run)).rejects.toBe(errors[5]!)
    expect(attempt.calls).toBe(6)
    expect(timer.sleeps).toEqual([...RESYNC_BACKOFF])
  })

  it("[UC-RR6N] resolves after six failures when the session ended up loaded", async () => {
    const errors = Array.from({ length: 6 }, () => statusError(503))
    const { route, timer, useCase, attempt, request } = setup(errors)
    route.loaded.add("ses_a")
    await expect(useCase.sync(request, attempt.run)).resolves.toBeUndefined()
    expect(attempt.calls).toBe(6)
    expect(timer.sleeps).toEqual([...RESYNC_BACKOFF])
  })

  it("[UC-RR5N] rethrows when the route leaves the session during a wait", async () => {
    const error = statusError(503)
    const { route, timer, useCase, attempt, request } = setup([error, "ok"])
    timer.onSleep = () => {
      route.routed = undefined
    }
    await expect(useCase.sync(request, attempt.run)).rejects.toBe(error)
    expect(attempt.calls).toBe(1)
    expect(timer.sleeps).toEqual([500])
  })

  it("[UC-RR3N] rethrows SessionNotFoundError at once, without waiting", async () => {
    const error = notFoundError("ses_a")
    const { timer, useCase, attempt, request } = setup([error])
    await expect(useCase.sync(request, attempt.run)).rejects.toBe(error)
    expect(attempt.calls).toBe(1)
    expect(timer.sleeps).toEqual([])
  })

  it("[UC-RR4N] rethrows a 404 at once, without waiting", async () => {
    const error = statusError(404)
    const { timer, useCase, attempt, request } = setup([error])
    await expect(useCase.sync(request, attempt.run)).rejects.toBe(error)
    expect(attempt.calls).toBe(1)
    expect(timer.sleeps).toEqual([])
  })

  it("[UC-RR10N] rethrows every other error at once, without waiting", async () => {
    for (const status of [400, 401, 500]) {
      const error = statusError(status)
      const { timer, useCase, attempt, request } = setup([error])
      await expect(useCase.sync(request, attempt.run)).rejects.toBe(error)
      expect(attempt.calls).toBe(1)
      expect(timer.sleeps).toEqual([])
    }
  })

  it("[UC-RR7N] passes a call without children through untouched", async () => {
    const error = statusError(503)
    const { timer, useCase, attempt } = setup([error])
    await expect(useCase.sync({ sessionID: "ses_a", children: false }, attempt.run)).rejects.toBe(error)
    expect(attempt.calls).toBe(1)
    expect(timer.sleeps).toEqual([])
  })

  it("[UC-RR7N] passes a call whose route is on another session through untouched", async () => {
    const error = statusError(503)
    const { timer, useCase, attempt, request } = setup([error], "ses_b")
    await expect(useCase.sync(request, attempt.run)).rejects.toBe(error)
    expect(attempt.calls).toBe(1)
    expect(timer.sleeps).toEqual([])
  })

  it("[UC-RR7N] passes a call whose route is home through untouched", async () => {
    const error = statusError(503)
    const { timer, useCase, attempt, request } = setup([error], null)
    await expect(useCase.sync(request, attempt.run)).rejects.toBe(error)
    expect(attempt.calls).toBe(1)
    expect(timer.sleeps).toEqual([])
  })
})
