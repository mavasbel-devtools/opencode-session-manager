// E2E tier: restore after reconnect through the real v2 TUI entry
// (`src/main/v2/tui.ts`), loaded by the real OpenCode 2.0.14 host
// (`Host.resolve` + `Host.load`), against the repo's fake V2 TUI host. Unlike
// the component suite (a 5 ms poll and a timer that never waits), this tier
// runs the production wiring: the 250 ms route poll and the real
// `VERIFY_BACKOFF` waits (500 … 8000 ms), so the give-up test takes ~16 s.
import { afterEach, describe, expect, it } from "bun:test"
import path from "node:path"
import { Host } from "@opencode/plugin/host"
import type { V2TuiContext } from "@session-manager/infrastructure/host/V2TuiContext"
import { fakeTuiContext } from "@test/support/fakes/hosts"
import { startFakeHerdr, type FakeHerdr } from "@test/support/fakes/herdr-socket"

const entries = Host.resolve({ directory: path.resolve(import.meta.dir, "../../../src/main/v2") })
type Loaded = { default: { setup: (context: V2TuiContext) => () => void } }

const cleanups: Array<() => void> = []
let herdr: FakeHerdr | undefined

afterEach(async () => {
  while (cleanups.length > 0) cleanups.pop()!()
  for (const name of ["HERDR_ENV", "HERDR_SOCKET_PATH", "HERDR_PANE_ID"] as const) delete process.env[name]
  await herdr?.stop()
  herdr = undefined
})

async function loadTui() {
  return ((await Host.load(entries.tui!)) as Loaded).default
}

async function setupWorld(sync?: (sessionID: string) => Promise<void>) {
  const context = fakeTuiContext()
  if (sync !== undefined) context.data.session.sync = sync
  cleanups.push((await loadTui()).setup(context))
  return context
}

/** Let the production 250 ms route poll observe the current route. */
const settled = () => Bun.sleep(450)

async function untilNavigated(context: Awaited<ReturnType<typeof setupWorld>>, count: number, timeoutMilliseconds = 15000) {
  const deadline = Date.now() + timeoutMilliseconds
  while (context.navigations.length < count) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${count} navigations; got ${JSON.stringify(context.navigations)}`)
    await Bun.sleep(50)
  }
}

function notFound(sessionID: string): (sessionID: string) => Promise<void> {
  return async () => {
    const error = new Error(`Session not found: ${sessionID}`)
    error.name = "SessionNotFoundError"
    throw error
  }
}

describe("restore after reconnect through the real v2 entry", () => {
  it("[UC-R1] navigates back with a toast when home follows a reconnect and the session re-syncs", async () => {
    const context = await setupWorld()
    context.sessions.set("ses_e2e", { id: "ses_e2e", title: "Lean Formalization" })
    context.route = { type: "session", sessionID: "ses_e2e" }
    await settled()
    context.emit("server.connected")
    context.route = { type: "home" }
    await untilNavigated(context, 1)
    expect(context.navigations).toEqual([{ type: "session", sessionID: "ses_e2e" }])
    expect(context.toasts.length).toBeGreaterThanOrEqual(1)
    expect(context.toasts[0]!.message).toContain("Restored")
  }, 30_000)

  it("[UC-R2N] stays home when no reconnect precedes it", async () => {
    const context = await setupWorld()
    context.sessions.set("ses_e2e", { id: "ses_e2e", title: "Lean Formalization" })
    context.route = { type: "session", sessionID: "ses_e2e" }
    await settled()
    context.route = { type: "home" }
    await Bun.sleep(2000)
    expect(context.navigations).toEqual([])
    expect(context.toasts).toEqual([])
  }, 30_000)

  it("[UC-R3N] stays home for a deleted session", async () => {
    const context = await setupWorld()
    context.sessions.set("ses_e2e", { id: "ses_e2e", title: "Lean Formalization" })
    context.route = { type: "session", sessionID: "ses_e2e" }
    await settled()
    context.emit("session.deleted", "ses_e2e")
    context.emit("server.connected")
    context.route = { type: "home" }
    await Bun.sleep(2000)
    expect(context.navigations).toEqual([])
    expect(context.toasts).toEqual([])
  }, 30_000)

  it("[UC-R3N] stays home when verify reports the session missing", async () => {
    const context = await setupWorld(notFound("ses_gone"))
    context.route = { type: "session", sessionID: "ses_gone" }
    await settled()
    context.emit("server.connected")
    context.route = { type: "home" }
    await Bun.sleep(2500)
    expect(context.navigations).toEqual([])
    expect(context.toasts).toEqual([])
  }, 30_000)

  it("[UC-R4N] keeps home and shows one info toast when verify keeps failing", async () => {
    let calls = 0
    const context = await setupWorld(async () => {
      calls++
      throw new Error("boom")
    })
    context.route = { type: "session", sessionID: "ses_e2e" }
    await settled()
    context.emit("server.connected")
    context.route = { type: "home" }
    const deadline = Date.now() + 60_000
    while (context.toasts.length === 0) {
      if (Date.now() > deadline) throw new Error(`timed out waiting for the give-up toast; sync ran ${calls}x`)
      await Bun.sleep(100)
    }
    expect(calls).toBe(5)
    expect(context.navigations).toEqual([])
    expect(context.toasts).toHaveLength(1)
    expect(context.toasts[0]!.variant).toBe("info")
  }, 120_000)

  it("[UC-R6N] stops restoring once RESTORE_LIMIT is reached", async () => {
    const context = await setupWorld()
    context.sessions.set("ses_e2e", { id: "ses_e2e", title: "Lean Formalization" })
    for (let round = 0; round < 3; round++) {
      context.route = { type: "session", sessionID: "ses_e2e" }
      await settled()
      context.emit("server.connected")
      context.route = { type: "home" }
      await untilNavigated(context, round + 1)
    }
    expect(context.navigations).toHaveLength(3)
    context.route = { type: "session", sessionID: "ses_e2e" }
    await settled()
    context.emit("server.connected")
    context.route = { type: "home" }
    await Bun.sleep(2000)
    expect(context.navigations).toHaveLength(3)
  }, 60_000)

  it("[UC-R8] dispose stops every restore: events and polls go nowhere", async () => {
    const context = await setupWorld()
    cleanups.pop()!()
    context.sessions.set("ses_e2e", { id: "ses_e2e", title: "Lean Formalization" })
    context.route = { type: "session", sessionID: "ses_e2e" }
    context.emit("server.connected")
    context.route = { type: "home" }
    await Bun.sleep(1500)
    expect(context.navigations).toEqual([])
    expect(context.toasts).toEqual([])
  }, 30_000)

  it("[UC-R9] wires the restore for every V2 TUI, inside a Herdr pane or out", async () => {
    const plain = await setupWorld()
    plain.sessions.set("ses_e2e", { id: "ses_e2e", title: "Lean Formalization" })
    plain.route = { type: "session", sessionID: "ses_e2e" }
    await settled()
    plain.emit("server.connected")
    plain.route = { type: "home" }
    await untilNavigated(plain, 1)
    expect(plain.navigations).toEqual([{ type: "session", sessionID: "ses_e2e" }])

    herdr = await startFakeHerdr()
    Object.assign(process.env, { HERDR_ENV: "1", HERDR_SOCKET_PATH: herdr.socketPath, HERDR_PANE_ID: "w9:p1" })
    const context = await setupWorld()
    for (const name of ["HERDR_ENV", "HERDR_SOCKET_PATH", "HERDR_PANE_ID"] as const) delete process.env[name]
    context.sessions.set("ses_e2e", { id: "ses_e2e", title: "Lean Formalization" })
    context.route = { type: "session", sessionID: "ses_e2e" }
    await settled()
    context.emit("server.connected")
    context.route = { type: "home" }
    await untilNavigated(context, 1)
    expect(context.navigations).toEqual([{ type: "session", sessionID: "ses_e2e" }])
    expect(context.toasts[0]!.message).toContain("Restored")
  }, 60_000)
})
