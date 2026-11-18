import { afterEach, describe, expect, it } from "bun:test"
import { RestoreAfterReconnectUseCase } from "@session-manager/application/RestoreAfterReconnectUseCase"
import { RetryResyncUseCase } from "@session-manager/application/RetryResyncUseCase"
import { ReconnectRestoreV2Adapter } from "@session-manager/infrastructure/adapters/inbound/tui/ReconnectRestoreV2Adapter"
import { ResyncRetryV2Adapter } from "@session-manager/infrastructure/adapters/inbound/tui/ResyncRetryV2Adapter"
import { V2ResyncRouteAdapter } from "@session-manager/infrastructure/adapters/outbound/tui/V2ResyncRouteAdapter"
import { V2SessionNavigatorAdapter } from "@session-manager/infrastructure/adapters/outbound/tui/V2SessionNavigatorAdapter"
import type { ResyncRequest } from "@session-manager/domain/model/ResyncRetry"
import type { RetryResyncPort } from "@session-manager/domain/ports/inbound/RetryResyncPort"
import type { TimerPort } from "@session-manager/domain/ports/outbound/TimerPort"
import { setupWith } from "@session-manager/main/v2/tui"
import { fakeTuiContext } from "@test/support/fakes/hosts"

// Component suite for F11 — the re-sync retry, behind the real inbound adapter
// and the real v2 host context, driving the stock session-screen effect
// (packages/tui/src/routes/session/index.tsx:341-372) directly.
//
// The plan names `setupWith` for the whole-plugin case, but the container has
// no timer seam: a fake clock and `setupWith` cannot both be used, so the world
// is built by hand (as `restore.test.ts` does) with a timer that never waits,
// and two scenarios still call `setupWith`: the extra installation check (which
// needs no sleep) and UC-RR9N's host without a function sync.
type FakeContext = ReturnType<typeof fakeTuiContext>
type Sync = (sessionID: string, options?: { readonly children?: boolean }) => Promise<void>
type Route = { readonly type: string; readonly sessionID?: string }

/** Inbound stand-in for UC-RR8: records every request and runs the attempt. */
class RecordingPort implements RetryResyncPort {
  readonly requests: ResyncRequest[] = []

  async sync(request: ResyncRequest, attempt: () => Promise<void>): Promise<void> {
    this.requests.push(request)
    return attempt()
  }
}

/** The stock effect's toast, for the errors the retry does not swallow. */
const TOAST = { variant: "error" as const, title: "Session unavailable", message: "Could not sync the session" }

/**
 * The stock session-screen effect: sync the session with its children; on a
 * resolve, go home when the session never arrived; on a rejection, go home
 * unless the route already moved on.
 */
async function runRouteEffect(context: FakeContext, sessionID: string): Promise<void> {
  try {
    await context.data.session.sync(sessionID, { children: true })
  } catch {
    if (context.ui.router.current().sessionID !== sessionID) return
    context.ui.toast.show(TOAST)
    context.ui.router.navigate({ type: "home" })
    return
  }
  if (context.data.session.get(sessionID) === undefined) {
    context.ui.toast.show(TOAST)
    context.ui.router.navigate({ type: "home" })
  }
}

interface World {
  readonly context: FakeContext
  readonly sleeps: number[]
  readonly dispose: () => void
}

function setupWorld(options: {
  sync: Sync
  route?: Route
  loaded?: boolean
  onSleep?: (count: number, context: FakeContext) => void
  port?: RetryResyncPort
  restoreGuard?: boolean
}): World {
  const context = fakeTuiContext()
  // The shared fake records navigations without moving `current()`, while the
  // host moves the route. This world moves it too, so "the stock effect went
  // home" is observable as the route it landed on, not only as the request.
  const navigate = context.ui.router.navigate
  context.ui.router.navigate = (route) => {
    context.route = route
    navigate(route)
  }
  context.data.session.sync = options.sync
  context.route = options.route ?? { type: "session", sessionID: "ses_a" }
  if (options.loaded !== false) context.sessions.set("ses_a", { id: "ses_a", title: "Lean Formalization" })

  const sleeps: number[] = []
  const timer: TimerPort = {
    async sleep(milliseconds) {
      sleeps.push(milliseconds)
      options.onSleep?.(sleeps.length, context)
    },
  }

  const port = options.port ?? new RetryResyncUseCase(new V2ResyncRouteAdapter(context), timer)
  const disposers = [new ResyncRetryV2Adapter(port).register(context)]
  if (options.restoreGuard === true) {
    const navigator = new V2SessionNavigatorAdapter(context)
    const restore = new RestoreAfterReconnectUseCase(navigator, timer)
    disposers.push(new ReconnectRestoreV2Adapter(restore, { pollMilliseconds: 5 }).register(context))
  }
  return { context, sleeps, dispose: () => { for (const dispose of disposers) dispose() } }
}

type Step = "ok" | Error

/** The sync under test: hands out the scripted outcomes in order, counting calls. */
function scriptedSync(...steps: Step[]): { sync: Sync; calls: () => number } {
  let calls = 0
  const queue = [...steps]
  return {
    sync: async () => {
      calls++
      const step = queue.shift() ?? "ok"
      if (step !== "ok") throw step
    },
    calls: () => calls,
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
  ;(error as Error & { _tag: string })._tag = "SessionNotFoundError"
  return error
}

/** The three real transport captures, from this machine's host. */
const TRANSPORT_CAPTURES = [
  '{"name":"ClientError","message":"Transport: ECONNRESET: Unable to connect. Is the computer able to access the url?","causes":[{"name":"TypeError","message":"ECONNRESET: Unable to connect. Is the computer able to access the url?","code":"ECONNRESET"}]}',
  '{"name":"ClientError","message":"Transport: ECONNRESET: The socket connection was closed unexpectedly. For more information, pass `verbose: true` in the second argument to fetch()","causes":[{"name":"TypeError","message":"ECONNRESET: The socket connection was closed unexpectedly. For more information, pass `verbose: true` in the second argument to fetch()","code":"ECONNRESET"}]}',
  '{"name":"ClientError","message":"Transport: ECONNREFUSED: Unable to connect. Is the computer able to access the url?","causes":[{"name":"TypeError","message":"ECONNREFUSED: Unable to connect. Is the computer able to access the url?","code":"ECONNREFUSED"}]}',
] as const

function transportError(json: string): Error {
  const captured = JSON.parse(json) as { name: string; message: string; causes?: unknown[] }
  const error = new Error(captured.message)
  error.name = captured.name
  if (captured.causes !== undefined) (error as Error & { causes?: unknown[] }).causes = captured.causes
  return error
}

const disposers: Array<() => void> = []

afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose()
})

describe("resync retry after a reconnect", () => {
  it("[UC-RR1] retries a 503 and keeps the session on screen", async () => {
    const script = scriptedSync(statusError(503), "ok")
    const world = setupWorld({ sync: script.sync })
    disposers.push(world.dispose)

    await runRouteEffect(world.context, "ses_a")

    expect(world.context.route).toEqual({ type: "session", sessionID: "ses_a" })
    expect(world.context.toasts).toEqual([])
    expect(world.context.navigations).toEqual([])
    expect(script.calls()).toBe(2)
    expect(world.sleeps).toEqual([500])
  })

  it("[UC-RR2] retries every real transport failure and keeps the route", async () => {
    for (const capture of TRANSPORT_CAPTURES) {
      const script = scriptedSync(transportError(capture), "ok")
      const world = setupWorld({ sync: script.sync })
      disposers.push(world.dispose)

      await runRouteEffect(world.context, "ses_a")

      expect(world.context.route).toEqual({ type: "session", sessionID: "ses_a" })
      expect(world.context.toasts).toEqual([])
      expect(world.context.navigations).toEqual([])
      expect(script.calls()).toBe(2)
    }
  })

  it("[UC-RR3N] rethrows SessionNotFoundError at once and the stock effect goes home", async () => {
    const script = scriptedSync(notFoundError("ses_a"))
    const world = setupWorld({ sync: script.sync })
    disposers.push(world.dispose)

    await runRouteEffect(world.context, "ses_a")

    expect(world.context.route).toEqual({ type: "home" })
    expect(world.context.toasts).toEqual([TOAST])
    expect(world.context.navigations).toEqual([{ type: "home" }])
    expect(script.calls()).toBe(1)
    expect(world.sleeps).toEqual([])
  })

  it("[UC-RR4N] never retries a 404", async () => {
    const script = scriptedSync(statusError(404))
    const world = setupWorld({ sync: script.sync })
    disposers.push(world.dispose)

    await runRouteEffect(world.context, "ses_a")

    expect(world.context.route).toEqual({ type: "home" })
    expect(world.context.toasts).toEqual([TOAST])
    expect(world.context.navigations).toEqual([{ type: "home" }])
    expect(script.calls()).toBe(1)
    expect(world.sleeps).toEqual([])
  })

  it("[UC-RR5N] stops when the route leaves the session during the first sleep", async () => {
    const script = scriptedSync(statusError(503), statusError(503))
    const world = setupWorld({
      sync: script.sync,
      onSleep: (count, context) => {
        if (count === 1) context.route = { type: "home" }
      },
    })
    disposers.push(world.dispose)

    await runRouteEffect(world.context, "ses_a")

    expect(world.context.route).toEqual({ type: "home" })
    expect(world.context.toasts).toEqual([])
    expect(world.context.navigations).toEqual([])
    expect(script.calls()).toBe(1)
    expect(world.sleeps).toEqual([500])
  })

  it("[UC-RR6N] resolves after six failures when the session is loaded", async () => {
    const script = scriptedSync(...Array.from({ length: 6 }, () => statusError(503)))
    const world = setupWorld({ sync: script.sync })
    disposers.push(world.dispose)

    await runRouteEffect(world.context, "ses_a")

    expect(world.context.route).toEqual({ type: "session", sessionID: "ses_a" })
    expect(world.context.toasts).toEqual([])
    expect(world.context.navigations).toEqual([])
    expect(script.calls()).toBe(6)
    expect(world.sleeps).toEqual([500, 1000, 2000, 4000, 8000])
  })

  it("[UC-RR6N] rethrows the last error after six failures when the session is not loaded", async () => {
    const script = scriptedSync(...Array.from({ length: 6 }, () => statusError(503)))
    const world = setupWorld({ sync: script.sync, loaded: false })
    disposers.push(world.dispose)

    await runRouteEffect(world.context, "ses_a")

    expect(world.context.route).toEqual({ type: "home" })
    expect(world.context.toasts).toEqual([TOAST])
    expect(world.context.navigations).toEqual([{ type: "home" }])
    expect(script.calls()).toBe(6)
    expect(world.sleeps).toEqual([500, 1000, 2000, 4000, 8000])
  })

  it("[UC-RR7N] passes an ineligible call through untouched", async () => {
    const noChildrenError = statusError(503)
    const withoutChildren = scriptedSync(noChildrenError)
    const noChildren = setupWorld({ sync: withoutChildren.sync })
    disposers.push(noChildren.dispose)
    await expect(noChildren.context.data.session.sync("ses_a")).rejects.toBe(noChildrenError)
    expect(noChildren.context.route).toEqual({ type: "session", sessionID: "ses_a" })
    expect(noChildren.context.toasts).toEqual([])
    expect(noChildren.context.navigations).toEqual([])
    expect(withoutChildren.calls()).toBe(1)
    expect(noChildren.sleeps).toEqual([])

    const whileHomeError = statusError(503)
    const whileHome = scriptedSync(whileHomeError)
    const home = setupWorld({ sync: whileHome.sync, route: { type: "home" } })
    disposers.push(home.dispose)
    await expect(home.context.data.session.sync("ses_a", { children: true })).rejects.toBe(whileHomeError)
    expect(home.context.route).toEqual({ type: "home" })
    expect(home.context.toasts).toEqual([])
    expect(home.context.navigations).toEqual([])
    expect(whileHome.calls()).toBe(1)
    expect(home.sleeps).toEqual([])
  })

  it("[UC-RR8] a re-setup keeps one wrapper on the newest port", async () => {
    const context = fakeTuiContext()
    context.route = { type: "session", sessionID: "ses_a" }
    context.sessions.set("ses_a", { id: "ses_a", title: "Lean Formalization" })
    let calls = 0
    context.data.session.sync = async () => {
      calls++
    }
    const first = new RecordingPort()
    const second = new RecordingPort()

    disposers.push(new ResyncRetryV2Adapter(first).register(context))
    const wrapper = context.data.session.sync
    disposers.push(new ResyncRetryV2Adapter(second).register(context))
    expect(context.data.session.sync).toBe(wrapper)

    await context.data.session.sync("ses_a", { children: true })

    expect(first.requests).toEqual([])
    expect(second.requests).toEqual([{ sessionID: "ses_a", children: true }])
    expect(calls).toBe(1)
    expect(context.route).toEqual({ type: "session", sessionID: "ses_a" })
    expect(context.toasts).toEqual([])
    expect(context.navigations).toEqual([])
  })

  it("[UC-RR9N] leaves a host without a function sync alone", () => {
    const fromSetup = fakeTuiContext()
    Object.defineProperty(fromSetup.data.session, "sync", {
      value: undefined,
      writable: true,
      configurable: true,
      enumerable: true,
    })
    let cleanup: (() => void) | undefined
    expect(() => {
      cleanup = setupWith(fromSetup, {}, "darwin")
    }).not.toThrow()
    cleanup?.()
    expect(fromSetup.data.session.sync).toBeUndefined()

    const direct = fakeTuiContext()
    Object.defineProperty(direct.data.session, "sync", {
      value: undefined,
      writable: true,
      configurable: true,
      enumerable: true,
    })
    expect(() => new ResyncRetryV2Adapter(new RecordingPort()).register(direct)).not.toThrow()
    expect(direct.data.session.sync).toBeUndefined()
  })

  it("[UC-RR10N] never retries 400, 401 or 500", async () => {
    for (const status of [400, 401, 500]) {
      const script = scriptedSync(statusError(status))
      const world = setupWorld({ sync: script.sync })
      disposers.push(world.dispose)

      await runRouteEffect(world.context, "ses_a")

      expect(world.context.route).toEqual({ type: "home" })
      expect(world.context.toasts).toEqual([TOAST])
      expect(world.context.navigations).toEqual([{ type: "home" }])
      expect(script.calls()).toBe(1)
      expect(world.sleeps).toEqual([])
    }
  })

  it("[UC-RR11] with the reconnect guard, a one-shot 503 leaves no home flip and no restore toast", async () => {
    const script = scriptedSync(statusError(503), "ok")
    const world = setupWorld({ sync: script.sync, restoreGuard: true })
    disposers.push(world.dispose)

    await runRouteEffect(world.context, "ses_a")
    await Bun.sleep(20)

    expect(world.context.route).toEqual({ type: "session", sessionID: "ses_a" })
    expect(world.context.toasts).toEqual([])
    expect(world.context.navigations).toEqual([])
    expect(script.calls()).toBe(2)
  })

  it("installs the wrapper when the whole plugin is set up", () => {
    // No fake clock here: `setupWith` builds the real container, so this
    // scenario proves the installation only and never re-syncs.
    const context = fakeTuiContext()
    const original = context.data.session.sync
    const cleanup = setupWith(context, {}, "darwin")
    try {
      expect(context.data.session.sync).not.toBe(original)
    } finally {
      cleanup()
    }
  })
})
