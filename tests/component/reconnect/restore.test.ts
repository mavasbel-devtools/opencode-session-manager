import { afterEach, describe, expect, it } from "bun:test"
import { RestoreAfterReconnectUseCase } from "@session-manager/application/RestoreAfterReconnectUseCase"
import { ReconnectRestoreV2Adapter } from "@session-manager/infrastructure/adapters/inbound/tui/ReconnectRestoreV2Adapter"
import { V2SessionNavigatorAdapter } from "@session-manager/infrastructure/adapters/outbound/tui/V2SessionNavigatorAdapter"
import type { VerifyResult } from "@session-manager/domain/ports/outbound/SessionNavigatorPort"
import type { TimerPort } from "@session-manager/domain/ports/outbound/TimerPort"
import { fakeTuiContext } from "@test/support/fakes/hosts"

// Component suite for F3: the real use case behind the real inbound adapter,
// against the fake V2 TUI host, with a timer that never waits. Route polling
// stays real (5 ms), so assertions wait on wall-clock bounds, not on frames.
function setupWorld(sync: (sessionID: string) => Promise<void>) {
  const context = fakeTuiContext()
  context.data.session.sync = sync
  const timer: TimerPort = {
    sleep: async () => undefined,
  }
  const navigator = new V2SessionNavigatorAdapter(context)
  const useCase = new RestoreAfterReconnectUseCase(navigator, timer)
  const dispose = new ReconnectRestoreV2Adapter(useCase, { pollMilliseconds: 5 }).register(context)
  return { context, dispose }
}

async function waitForNavigations(context: ReturnType<typeof fakeTuiContext>, count: number, timeout = 2000) {
  const started = Date.now()
  while (context.navigations.length < count && Date.now() - started < timeout) await Bun.sleep(5)
}

let dispose: (() => void) | undefined

afterEach(() => {
  dispose?.()
  dispose = undefined
})

describe("restore after reconnect", () => {
  it("[UC-R1] navigates back with a toast when home follows a reconnect and the session re-syncs", async () => {
    const world = setupWorld(async () => undefined)
    dispose = world.dispose
    world.context.sessions.set("ses_a", { id: "ses_a", title: "Lean Formalization" })
    world.context.route = { type: "session", sessionID: "ses_a" }
    await Bun.sleep(30)
    world.context.emit("server.connected")
    world.context.route = { type: "home" }
    await waitForNavigations(world.context, 1)
    expect(world.context.navigations).toEqual([{ type: "session", sessionID: "ses_a" }])
    expect(world.context.toasts.length).toBeGreaterThanOrEqual(1)
    expect(world.context.toasts[0]!.message).toContain("Restored")
  })

  it("[UC-R2N] stays home when no reconnect precedes it", async () => {
    const world = setupWorld(async () => undefined)
    dispose = world.dispose
    world.context.route = { type: "session", sessionID: "ses_a" }
    await Bun.sleep(30)
    world.context.route = { type: "home" }
    await Bun.sleep(150)
    expect(world.context.navigations).toEqual([])
    expect(world.context.toasts).toEqual([])
  })

  it("[UC-R3N] stays home for a deleted session", async () => {
    const world = setupWorld(async () => undefined)
    dispose = world.dispose
    world.context.route = { type: "session", sessionID: "ses_a" }
    await Bun.sleep(30)
    world.context.emit("session.deleted", "ses_a")
    world.context.emit("server.connected")
    world.context.route = { type: "home" }
    await Bun.sleep(150)
    expect(world.context.navigations).toEqual([])
    expect(world.context.toasts).toEqual([])
  })

  it("[UC-R3N] stays home when verify reports the session missing", async () => {
    const world = setupWorld(async () => {
      const error = new Error("Session not found: ses_gone")
      error.name = "SessionNotFoundError"
      throw error
    })
    dispose = world.dispose
    world.context.route = { type: "session", sessionID: "ses_gone" }
    await Bun.sleep(30)
    world.context.emit("server.connected")
    world.context.route = { type: "home" }
    await Bun.sleep(150)
    expect(world.context.navigations).toEqual([])
    expect(world.context.toasts).toEqual([])
  })

  it("[UC-R4N] keeps home and shows one info toast when verify keeps failing", async () => {
    let calls = 0
    const world = setupWorld(async () => {
      calls++
      throw new Error("boom")
    })
    dispose = world.dispose
    world.context.route = { type: "session", sessionID: "ses_a" }
    await Bun.sleep(30)
    world.context.emit("server.connected")
    world.context.route = { type: "home" }
    const started = Date.now()
    while (calls < 5 && Date.now() - started < 2000) await Bun.sleep(5)
    await Bun.sleep(50)
    expect(calls).toBe(5)
    expect(world.context.navigations).toEqual([])
    expect(world.context.toasts).toHaveLength(1)
    expect(world.context.toasts[0]!.variant).toBe("info")
  })

  it("[UC-R5N] aborts when the route leaves home during verify", async () => {
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const world = setupWorld(() => gate)
    dispose = world.dispose
    world.context.route = { type: "session", sessionID: "ses_a" }
    await Bun.sleep(30)
    world.context.emit("server.connected")
    world.context.route = { type: "home" }
    await Bun.sleep(50)
    world.context.route = { type: "session", sessionID: "ses_a" }
    release()
    await Bun.sleep(100)
    expect(world.context.navigations).toEqual([])
    expect(world.context.toasts).toEqual([])
  })

  it("[UC-R6N] stops restoring once RESTORE_LIMIT is reached", async () => {
    const world = setupWorld(async () => undefined)
    dispose = world.dispose
    for (let round = 0; round < 3; round++) {
      world.context.route = { type: "session", sessionID: "ses_a" }
      await Bun.sleep(30)
      world.context.emit("server.connected")
      world.context.route = { type: "home" }
      await waitForNavigations(world.context, round + 1)
    }
    expect(world.context.navigations).toHaveLength(3)
    world.context.route = { type: "session", sessionID: "ses_a" }
    await Bun.sleep(30)
    world.context.emit("server.connected")
    world.context.route = { type: "home" }
    await Bun.sleep(150)
    expect(world.context.navigations).toHaveLength(3)
  })

  it("[UC-R7N] ignores a session-to-session route change", async () => {
    const world = setupWorld(async () => undefined)
    dispose = world.dispose
    world.context.route = { type: "session", sessionID: "ses_a" }
    await Bun.sleep(30)
    world.context.emit("server.connected")
    world.context.route = { type: "session", sessionID: "ses_b" }
    await Bun.sleep(150)
    expect(world.context.navigations).toEqual([])
    expect(world.context.toasts).toEqual([])
  })

  it("[UC-R8] dispose stops every restore: events and polls go nowhere", async () => {
    const world = setupWorld(async () => undefined)
    world.dispose()
    dispose = undefined
    world.context.route = { type: "session", sessionID: "ses_a" }
    world.context.emit("server.connected")
    world.context.route = { type: "home" }
    await Bun.sleep(150)
    expect(world.context.navigations).toEqual([])
    expect(world.context.toasts).toEqual([])
  })
})
