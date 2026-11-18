// E2E tier: the re-sync retry through the real v2 TUI entry
// (`src/main/v2/tui.ts`), loaded by the real OpenCode 2.0.14 host
// (`Host.resolve` + `Host.load`), against the repo's fake V2 TUI host. Unlike
// the component suite (a timer that never waits), this tier runs the production
// wiring: `createTuiContainer` builds `RetryResyncUseCase` over the real
// `SystemTimerAdapter`, so the retries wait the real `RESYNC_BACKOFF` (500 …
// 8000 ms) and the give-up scenario takes ~31 s for its two branches.
//
// The stock session-screen effect (`packages/tui/src/routes/session/index.tsx:
// 341-372`) is driven directly, as the component suite does: sync the session
// with its children; on a resolve, go home when the session never arrived; on a
// rejection, go home unless the route already moved on.
import { afterEach, describe, expect, it } from "bun:test"
import path from "node:path"
import { Host } from "@opencode/plugin/host"
import type { V2TuiContext } from "@session-manager/infrastructure/host/V2TuiContext"
import { fakeTuiContext } from "@test/support/fakes/hosts"

const entries = Host.resolve({ directory: path.resolve(import.meta.dir, "../../../src/main/v2") })
type Loaded = { default: { setup: (context: V2TuiContext) => () => void } }

type FakeContext = ReturnType<typeof fakeTuiContext>
type Sync = (sessionID: string, options?: { readonly children?: boolean }) => Promise<void>
type Route = { readonly type: string; readonly sessionID?: string }

const cleanups: Array<() => void> = []

afterEach(async () => {
  while (cleanups.length > 0) cleanups.pop()!()
  for (const name of ["HERDR_ENV", "HERDR_SOCKET_PATH", "HERDR_PANE_ID"] as const) delete process.env[name]
})

async function loadTui() {
  return ((await Host.load(entries.tui!)) as Loaded).default
}

/** The real plugin entry (`setup` → `setupWith`), with the scripted sync installed before it registers. */
async function setupWorld(options: {
  sync: Sync
  route?: Route
  loaded?: boolean
  prepare?: (context: FakeContext) => void
}): Promise<FakeContext> {
  const context = fakeTuiContext()
  context.data.session.sync = options.sync
  context.route = options.route ?? { type: "session", sessionID: "ses_a" }
  if (options.loaded !== false) context.sessions.set("ses_a", { id: "ses_a", title: "Lean Formalization" })
  options.prepare?.(context)
  cleanups.push((await loadTui()).setup(context))
  return context
}

/** The stock effect's toast, for the errors the retry does not swallow. */
const TOAST = { variant: "error" as const, title: "Session unavailable", message: "Could not sync the session" }

/** The stock session-screen effect over the real wrapped `data.session.sync`. */
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

type Step = "ok" | Error

/** The sync under test: hands out the scripted outcomes in order, counting calls. */
function scripted(...steps: Step[]): { sync: Sync; calls: () => number } {
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

function statusError(status: number, shape: "direct" | "cause" | "message" = "direct"): Error {
  const error = new Error(shape === "message" ? `UnexpectedStatus: ${status}` : "Unexpected status")
  error.name = "ClientError"
  if (shape === "direct") (error as Error & { status?: number }).status = status
  if (shape === "cause") (error as Error & { cause?: { status: number } }).cause = { status }
  return error
}

function notFoundError(sessionID: string, tag: "name" | "_tag" | "both" = "both"): Error {
  const error = new Error(`Session not found: ${sessionID}`)
  if (tag !== "_tag") error.name = "SessionNotFoundError"
  if (tag !== "name") (error as Error & { _tag?: string })._tag = "SessionNotFoundError"
  return error
}

interface Shape {
  readonly name: string
  readonly message: string
  readonly code?: string
  readonly cause?: unknown
  readonly causes?: unknown[]
}

function shapeError(shape: Shape): Error {
  const error = new Error(shape.message)
  error.name = shape.name
  if (shape.code !== undefined) (error as Error & { code?: string }).code = shape.code
  if (shape.cause !== undefined) (error as Error & { cause?: unknown }).cause = shape.cause
  if (shape.causes !== undefined) (error as Error & { causes?: unknown[] }).causes = shape.causes
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

/** A cause chain of plain errors, six levels below the rejection. */
function deepCauseChain(): Error {
  const error = new Error("boom")
  let level: Error = error
  for (let depth = 0; depth < 6; depth++) {
    const next = new Error("level")
    ;(level as Error & { cause?: Error }).cause = next
    level = next
  }
  return error
}

describe("re-sync retry through the real v2 entry", () => {
  it("[UC-RR1] retries a 503 in the status, the cause or the message, and keeps the session on screen", async () => {
    for (const error of [statusError(503), statusError(503, "cause"), statusError(503, "message")]) {
      const script = scripted(error, "ok")
      const context = await setupWorld({ sync: script.sync })

      await runRouteEffect(context, "ses_a")

      expect(context.route).toEqual({ type: "session", sessionID: "ses_a" })
      expect(context.toasts).toEqual([])
      expect(context.navigations).toEqual([])
      expect(script.calls()).toBe(2)
    }
  }, 30_000)

  it("[UC-RR2] retries every real transport failure, in the message, a cause or a causes array, and keeps the route", async () => {
    const shapes = [
      ...TRANSPORT_CAPTURES.map(transportError),
      shapeError({ name: "ClientError", message: "Failed", cause: { code: "EPIPE" } }),
      shapeError({ name: "ClientError", message: "Failed", causes: [{ code: "ETIMEDOUT" }] }),
    ]
    for (const error of shapes) {
      const script = scripted(error, "ok")
      const context = await setupWorld({ sync: script.sync })

      await runRouteEffect(context, "ses_a")

      expect(context.route).toEqual({ type: "session", sessionID: "ses_a" })
      expect(context.toasts).toEqual([])
      expect(context.navigations).toEqual([])
      expect(script.calls()).toBe(2)
    }
  }, 30_000)

  it("[UC-RR3N] rethrows SessionNotFoundError at once, by name or by tag, and the stock effect goes home", async () => {
    for (const error of [notFoundError("ses_a", "name"), notFoundError("ses_a", "_tag"), notFoundError("ses_a")]) {
      const script = scripted(error)
      const context = await setupWorld({ sync: script.sync })

      await runRouteEffect(context, "ses_a")

      expect(context.route).toEqual({ type: "session", sessionID: "ses_a" })
      expect(context.toasts).toEqual([TOAST])
      expect(context.navigations).toEqual([{ type: "home" }])
      expect(script.calls()).toBe(1)
    }
  }, 30_000)

  it("[UC-RR4N] never retries a 404, in the status or in the cause", async () => {
    for (const error of [statusError(404), statusError(404, "cause")]) {
      const script = scripted(error)
      const context = await setupWorld({ sync: script.sync })

      await runRouteEffect(context, "ses_a")

      expect(context.toasts).toEqual([TOAST])
      expect(context.navigations).toEqual([{ type: "home" }])
      expect(script.calls()).toBe(1)
    }
  }, 30_000)

  it("[UC-RR5N] stops when the route left the session, during the attempt or during the first wait", async () => {
    // The route leaves while the failing call is still in flight.
    let leaving: FakeContext | undefined
    const duringAttempt = statusError(503)
    leaving = await setupWorld({
      sync: async () => {
        leaving!.route = { type: "home" }
        throw duringAttempt
      },
    })

    await runRouteEffect(leaving, "ses_a")

    expect(leaving.route).toEqual({ type: "home" })
    expect(leaving.toasts).toEqual([])
    expect(leaving.navigations).toEqual([])

    // The route leaves inside the production 500 ms wait.
    const script = scripted(statusError(503), statusError(503))
    const context = await setupWorld({ sync: script.sync })
    const left = setTimeout(() => {
      context.route = { type: "home" }
    }, 100)
    try {
      await runRouteEffect(context, "ses_a")
    } finally {
      clearTimeout(left)
    }

    expect(context.route).toEqual({ type: "home" })
    expect(context.toasts).toEqual([])
    expect(context.navigations).toEqual([])
    expect(script.calls()).toBe(1)
  }, 30_000)

  it("[UC-RR6N] resolves after six failures when the session is loaded, and rethrows the last error when it is not", async () => {
    const loaded = scripted(...Array.from({ length: 6 }, () => statusError(503)))
    const kept = await setupWorld({ sync: loaded.sync })

    await runRouteEffect(kept, "ses_a")

    expect(kept.route).toEqual({ type: "session", sessionID: "ses_a" })
    expect(kept.toasts).toEqual([])
    expect(kept.navigations).toEqual([])
    expect(loaded.calls()).toBe(6)

    const missing = scripted(...Array.from({ length: 6 }, () => statusError(503)))
    const gone = await setupWorld({ sync: missing.sync, loaded: false })

    await runRouteEffect(gone, "ses_a")

    expect(gone.toasts).toEqual([TOAST])
    expect(gone.navigations).toEqual([{ type: "home" }])
    expect(missing.calls()).toBe(6)
  }, 120_000)

  it("[UC-RR7N] passes an ineligible call through untouched, exactly one call with the error unchanged", async () => {
    const noChildrenError = statusError(503)
    const withoutChildren = scripted(noChildrenError)
    const noChildren = await setupWorld({ sync: withoutChildren.sync })

    await expect(noChildren.data.session.sync("ses_a")).rejects.toBe(noChildrenError)

    expect(noChildren.route).toEqual({ type: "session", sessionID: "ses_a" })
    expect(noChildren.toasts).toEqual([])
    expect(noChildren.navigations).toEqual([])
    expect(withoutChildren.calls()).toBe(1)

    const whileHomeError = statusError(503)
    const whileHome = scripted(whileHomeError)
    const home = await setupWorld({ sync: whileHome.sync, route: { type: "home" } })

    await expect(home.data.session.sync("ses_a", { children: true })).rejects.toBe(whileHomeError)

    expect(home.route).toEqual({ type: "home" })
    expect(home.toasts).toEqual([])
    expect(home.navigations).toEqual([])
    expect(whileHome.calls()).toBe(1)
  }, 30_000)

  it("[UC-RR8] a re-setup keeps one wrapper on the newest context, and cleanup leaves it in place", async () => {
    const script = scripted(statusError(503), "ok")
    const context = await setupWorld({ sync: script.sync })
    const wrapper = context.data.session.sync

    const second = (await loadTui()).setup(context)
    cleanups.push(second)

    expect(context.data.session.sync).toBe(wrapper)

    await context.data.session.sync("ses_a", { children: true })

    expect(context.route).toEqual({ type: "session", sessionID: "ses_a" })
    expect(context.toasts).toEqual([])
    expect(context.navigations).toEqual([])
    expect(script.calls()).toBe(2)

    while (cleanups.length > 0) cleanups.pop()!()
    expect(context.data.session.sync).toBe(wrapper)
  }, 30_000)

  it("[UC-RR9N] leaves a host without a function sync, without a writable sync or without a session store alone", async () => {
    const tui = await loadTui()
    let cleanup: (() => void) | undefined

    // A host that has no `sync` function.
    const fromSetup = fakeTuiContext()
    Object.defineProperty(fromSetup.data.session, "sync", { value: undefined, writable: true, configurable: true, enumerable: true })
    expect(() => {
      cleanup = tui.setup(fromSetup)
    }).not.toThrow()
    cleanup?.()
    expect(fromSetup.data.session.sync).toBeUndefined()

    // A host whose `sync` is read-only.
    const readOnly = async () => undefined
    const locked = fakeTuiContext()
    Object.defineProperty(locked.data.session, "sync", { value: readOnly, writable: false, configurable: true })
    expect(() => {
      cleanup = tui.setup(locked)
    }).not.toThrow()
    cleanup?.()
    expect(locked.data.session.sync).toBe(readOnly)

    // A host with no session store at all.
    const sessionless = fakeTuiContext()
    Object.defineProperty(sessionless.data, "session", { value: undefined, writable: true, configurable: true })
    expect(() => {
      cleanup = tui.setup(sessionless)
    }).not.toThrow()
    cleanup?.()
    expect(sessionless.data.session).toBeUndefined()
  }, 30_000)

  it("[UC-RR10N] never retries 400, 401, 500, an unknown error or a deep cause chain", async () => {
    const errors = [
      statusError(400),
      statusError(401),
      statusError(500),
      deepCauseChain(),
      shapeError({ name: "ClientError", message: "Failed", causes: ["ECONNRESET"] }),
      new Error("boom"),
    ]
    for (const error of errors) {
      const script = scripted(error)
      const context = await setupWorld({ sync: script.sync })

      await runRouteEffect(context, "ses_a")

      expect(context.toasts).toEqual([TOAST])
      expect(context.navigations).toEqual([{ type: "home" }])
      expect(script.calls()).toBe(1)
    }
  }, 30_000)

  it("[UC-RR11] with the reconnect guard, a one-shot 503 leaves no home flip and no restore toast", async () => {
    const script = scripted(statusError(503), "ok")
    const context = await setupWorld({ sync: script.sync })
    context.emit("server.connected")

    await runRouteEffect(context, "ses_a")
    await Bun.sleep(400)

    expect(context.route).toEqual({ type: "session", sessionID: "ses_a" })
    expect(context.toasts).toEqual([])
    expect(context.navigations).toEqual([])
    expect(script.calls()).toBe(2)
  }, 30_000)
})
