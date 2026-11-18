import { describe, expect, it } from "bun:test"
import { ResyncRetryV2Adapter } from "@session-manager/infrastructure/adapters/inbound/tui/ResyncRetryV2Adapter"
import type { ResyncRequest } from "@session-manager/domain/model/ResyncRetry"
import type { RetryResyncPort } from "@session-manager/domain/ports/inbound/RetryResyncPort"
import { fakeTuiContext } from "@test/support/fakes/hosts"

// F11 — the inbound adapter that wraps `data.session.sync` once per host
// context: the session screen's `{ children: true }` call goes through the
// retry, everything else passes through, and a re-setup re-points the one
// wrapper instead of stacking another.
const SLOT = Symbol.for("opencode-session-manager.resync-retry")

type Sync = (sessionID: string, options?: { readonly children?: boolean }) => Promise<void>

/** Inbound stand-in: records every request the wrapper hands over. */
class RecordingPort implements RetryResyncPort {
  readonly requests: ResyncRequest[] = []

  async sync(request: ResyncRequest, attempt: () => Promise<void>): Promise<void> {
    this.requests.push(request)
    return attempt()
  }
}

interface OriginalCall {
  readonly receiver: unknown
  readonly sessionID: string
  readonly options: { readonly children?: boolean } | undefined
}

/** Replaces the fake host's sync with one that records how it was called. */
function installOriginal(context: ReturnType<typeof fakeTuiContext>): OriginalCall[] {
  const calls: OriginalCall[] = []
  const original: Sync = function (this: unknown, sessionID, options) {
    calls.push({ receiver: this, sessionID, options })
    return Promise.resolve()
  }
  context.data.session.sync = original
  return calls
}

describe("ResyncRetryV2Adapter", () => {
  it("[UC-RR8] installs a wrapper that is not the host's own sync", () => {
    const context = fakeTuiContext()
    const original = context.data.session.sync
    new ResyncRetryV2Adapter(new RecordingPort()).register(context)
    expect(context.data.session.sync).not.toBe(original)
    expect(typeof context.data.session.sync).toBe("function")
  })

  it("[UC-RR7N] hands the request, the options and the receiver to the original unchanged", async () => {
    const context = fakeTuiContext()
    const calls = installOriginal(context)
    const port = new RecordingPort()
    new ResyncRetryV2Adapter(port).register(context)

    await context.data.session.sync("ses_a", { children: true })

    expect(port.requests).toEqual([{ sessionID: "ses_a", children: true }])
    expect(calls).toHaveLength(1)
    expect(calls[0]!.receiver).toBe(context.data.session)
    expect(calls[0]!.sessionID).toBe("ses_a")
    expect(calls[0]!.options).toEqual({ children: true })
  })

  it("[UC-RR7N] still routes a call without children through the port, with children false", async () => {
    const context = fakeTuiContext()
    installOriginal(context)
    const port = new RecordingPort()
    new ResyncRetryV2Adapter(port).register(context)

    await context.data.session.sync("ses_a")

    expect(port.requests).toEqual([{ sessionID: "ses_a", children: false }])
  })

  it("[UC-RR8] a second register keeps one wrapper and points it at the newest port", async () => {
    const context = fakeTuiContext()
    installOriginal(context)
    const first = new RecordingPort()
    const second = new RecordingPort()

    new ResyncRetryV2Adapter(first).register(context)
    const wrapper = context.data.session.sync
    new ResyncRetryV2Adapter(second).register(context)

    expect(context.data.session.sync).toBe(wrapper)
    await context.data.session.sync("ses_a", { children: true })
    expect(first.requests).toEqual([])
    expect(second.requests).toEqual([{ sessionID: "ses_a", children: true }])
  })

  it("[UC-RR9N] does nothing when the host has no function sync", () => {
    for (const value of [undefined, 42, "sync"]) {
      const context = fakeTuiContext()
      Object.defineProperty(context.data.session, "sync", {
        value,
        writable: true,
        configurable: true,
        enumerable: true,
      })
      expect(() => new ResyncRetryV2Adapter(new RecordingPort()).register(context)).not.toThrow()
      expect(context.data.session.sync).toBe(value as unknown as Sync)
    }
  })

  it("[UC-RR9N] leaves a read-only sync alone and does not throw", () => {
    const context = fakeTuiContext()
    const calls = installOriginal(context)
    const original = context.data.session.sync
    Object.defineProperty(context.data.session, "sync", {
      value: original,
      writable: false,
      configurable: true,
      enumerable: true,
    })
    const port = new RecordingPort()

    expect(() => new ResyncRetryV2Adapter(port).register(context)).not.toThrow()
    expect(context.data.session.sync).toBe(original)
    expect(port.requests).toEqual([])
    expect(calls).toEqual([])
  })

  it("[UC-RR9N] leaves a getter-only sync alone and does not throw", () => {
    const context = fakeTuiContext()
    const calls = installOriginal(context)
    const original = context.data.session.sync
    Object.defineProperty(context.data.session, "sync", {
      get: () => original,
      configurable: true,
      enumerable: true,
    })
    const port = new RecordingPort()

    expect(() => new ResyncRetryV2Adapter(port).register(context)).not.toThrow()
    expect(context.data.session.sync).toBe(original)
    expect(port.requests).toEqual([])
    expect(calls).toEqual([])
  })

  it("[UC-RR8] leaves the wrapper installed after its disposer runs", async () => {
    const context = fakeTuiContext()
    installOriginal(context)
    const port = new RecordingPort()
    const dispose = new ResyncRetryV2Adapter(port).register(context)
    const wrapper = context.data.session.sync

    dispose()

    expect(context.data.session.sync).toBe(wrapper)
    await context.data.session.sync("ses_a", { children: true })
    expect(port.requests).toEqual([{ sessionID: "ses_a", children: true }])
  })

  it("[UC-RR8] hides its slot as a non-enumerable property", () => {
    const context = fakeTuiContext()
    const session = context.data.session
    new ResyncRetryV2Adapter(new RecordingPort()).register(context)

    expect(Object.getOwnPropertySymbols(session)).toContain(SLOT)
    expect(Object.keys(session)).not.toContain(SLOT)
    expect(Object.prototype.propertyIsEnumerable.call(session, SLOT)).toBe(false)
    expect(Object.getOwnPropertyDescriptor(session, SLOT)?.enumerable).toBe(false)
  })
})
