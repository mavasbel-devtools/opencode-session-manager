import { afterEach, describe, expect, it } from "bun:test"
import { ReconnectRestoreV2Adapter } from "@session-manager/infrastructure/adapters/inbound/tui/ReconnectRestoreV2Adapter"
import type { RestoreAfterReconnectPort } from "@session-manager/domain/ports/inbound/RestoreAfterReconnectPort"
import type { RouteSample } from "@session-manager/domain/model/ReconnectRestore"
import { fakeTuiContext } from "@test/support/fakes/hosts"

/** Inbound stand-in: records every observation the adapter forwards. */
class FakeRestorePort implements RestoreAfterReconnectPort {
  readonly routes: RouteSample[] = []
  readonly connectedAt: number[] = []
  readonly deleted: string[] = []
  readonly disposals = { count: 0 }

  observeRoute(sample: RouteSample): void {
    this.routes.push(sample)
  }

  observeConnected(at: number): void {
    this.connectedAt.push(at)
  }

  observeDeleted(sessionID: string): void {
    this.deleted.push(sessionID)
  }

  dispose(): void {
    this.disposals.count++
  }
}

const wait = (milliseconds: number) => Bun.sleep(milliseconds)

describe("ReconnectRestoreV2Adapter", () => {
  let cleanup: (() => void) | undefined

  afterEach(() => {
    cleanup?.()
    cleanup = undefined
  })

  it("[UC-R1] forwards server.connected with the current time", async () => {
    const context = fakeTuiContext()
    const port = new FakeRestorePort()
    cleanup = new ReconnectRestoreV2Adapter(port, { pollMilliseconds: 5 }).register(context)
    const before = Date.now()
    context.emit("server.connected")
    expect(port.connectedAt).toHaveLength(1)
    expect(port.connectedAt[0]!).toBeGreaterThanOrEqual(before)
    expect(port.connectedAt[0]!).toBeLessThanOrEqual(Date.now())
  })

  it("[UC-R3N] forwards session.deleted with the removed id", () => {
    const context = fakeTuiContext()
    const port = new FakeRestorePort()
    cleanup = new ReconnectRestoreV2Adapter(port, { pollMilliseconds: 5 }).register(context)
    context.emit("session.deleted", "ses_gone")
    expect(port.deleted).toEqual(["ses_gone"])
  })

  it("[UC-R7N] polls the route, so a session-to-session change reaches the port", async () => {
    const context = fakeTuiContext()
    const port = new FakeRestorePort()
    context.route = { type: "session", sessionID: "ses_a" }
    cleanup = new ReconnectRestoreV2Adapter(port, { pollMilliseconds: 5 }).register(context)
    await wait(30)
    context.route = { type: "session", sessionID: "ses_b" }
    await wait(30)
    const ids = port.routes.map((sample) => sample.sessionID)
    expect(ids).toContain("ses_a")
    expect(ids[ids.length - 1]).toBe("ses_b")
  })

  it("[UC-R5N] forwards the home-to-session samples an abort is decided from", async () => {
    const context = fakeTuiContext()
    const port = new FakeRestorePort()
    context.route = { type: "home" }
    cleanup = new ReconnectRestoreV2Adapter(port, { pollMilliseconds: 5 }).register(context)
    await wait(30)
    context.route = { type: "session", sessionID: "ses_a" }
    await wait(30)
    expect(port.routes[0]).toEqual({ type: "home" })
    expect(port.routes[port.routes.length - 1]).toEqual({ type: "session", sessionID: "ses_a" })
  })

  it("[UC-R8] dispose unsubscribes both events, clears the poll and stops the port", async () => {
    const context = fakeTuiContext()
    const port = new FakeRestorePort()
    const dispose = new ReconnectRestoreV2Adapter(port, { pollMilliseconds: 5 }).register(context)
    cleanup = dispose
    context.route = { type: "session", sessionID: "ses_a" }
    await wait(30)
    const seen = port.routes.length
    expect(seen).toBeGreaterThan(0)
    dispose()
    cleanup = undefined
    expect(port.disposals.count).toBe(1)
    expect(context.subscriptions.every((subscription) => !subscription.active)).toBe(true)
    context.emit("server.connected")
    context.emit("session.deleted", "ses_a")
    context.route = { type: "home" }
    await wait(30)
    expect(port.connectedAt).toEqual([])
    expect(port.deleted).toEqual([])
    expect(port.routes).toHaveLength(seen)
  })
})
