// E2E tier: the Herdr pane presentation (agent + title), from the real v2 TUI
// entry found and loaded by the real OpenCode 2.0.14 plugin host
// (`Host.resolve` + `Host.load`), through the composition root, the use case
// and the socket adapter, to a Unix socket in this process, so coverage is
// measured. The plugin reads its environment itself, as in production: this
// test sets HERDR_* to the stand-in socket and takes them away afterwards (the
// test preload keeps the user's Herdr out).
//
// Stand-ins: the TUI's router and synced session data (owned by the host's TUI
// app) and Herdr's socket (`tests/support/fakes/herdr-socket.ts`, which answers
// like Herdr's API). The live tier runs the real OpenCode TUI in a real Herdr.
import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import path from "node:path"
import { Host } from "@opencode/plugin/host"
import type { V2TuiContext } from "@session-manager/infrastructure/host/V2TuiContext"
import { fakeTuiContext } from "@test/support/fakes/hosts"
import { startFakeHerdr, type FakeHerdr, type HerdrRequest } from "@test/support/fakes/herdr-socket"

const entries = Host.resolve({ directory: path.resolve(import.meta.dir, "../../../src/main/v2") })
type Loaded = { default: { setup: (context: V2TuiContext) => () => void } }

let herdr: FakeHerdr | undefined

beforeEach(async () => {
  herdr = await startFakeHerdr()
  Object.assign(process.env, { HERDR_ENV: "1", HERDR_SOCKET_PATH: herdr.socketPath, HERDR_PANE_ID: "w4:p2" })
})

afterEach(async () => {
  for (const name of ["HERDR_ENV", "HERDR_SOCKET_PATH", "HERDR_PANE_ID"]) delete process.env[name]
  await herdr?.stop()
  herdr = undefined
})

/** What the pane was told, in order: a title, or `cleared`. */
const shown = () => herdr!.requests.map((request) => (request.params["title"] as string | undefined) ?? "cleared")

/** The displayed values of one request, as the component suite reads them. */
const fields = (request: HerdrRequest) => ({
  title: request.params["title"] as string | undefined,
  display_agent: request.params["display_agent"] as string | undefined,
  clear: request.params["clear_title"] === true && request.params["clear_display_agent"] === true,
})

async function until(condition: () => boolean, timeoutMilliseconds = 5000) {
  const deadline = Date.now() + timeoutMilliseconds
  while (!condition()) {
    if (Date.now() > deadline) throw new Error(`timed out; the pane was told ${JSON.stringify(shown())}`)
    await Bun.sleep(20)
  }
}

async function loadTui() {
  return ((await Host.load(entries.tui!)) as Loaded).default
}

describe("Herdr pane presentation through the real 2.0.14 host", () => {
  it("follows the TUI: home, a session, its sub-agent, an agent change, a rename, a long title, another session, then exit [UC-1][UC-2][UC-3][UC-4][UC-6][UC-8]", async () => {
    const ROOT = "Lean Formalization Root"
    const RENAMED = "Renamed while open"
    const OTHER = "Unified LLM endpoint"
    const context = fakeTuiContext()
    context.sessions.set("ses_root", { id: "ses_root", title: ROOT, agent: "build" })
    context.sessions.set("ses_child", { id: "ses_child", parentID: "ses_root", title: "explore subtask", agent: "explore" })
    context.sessions.set("ses_other", { id: "ses_other", title: OTHER, agent: "plan" })
    const cleanup = (await loadTui()).setup(context)
    // Home: nothing open, so the pane is handed back to Herdr's defaults.
    await until(() => shown().length === 1)
    expect(fields(herdr!.requests[0]!).clear).toBe(true)

    context.route = { type: "session", sessionID: "ses_root" }
    await until(() => shown().length === 2)
    expect(fields(herdr!.requests[1]!)).toEqual({ title: ROOT, display_agent: "build", clear: false })

    // A sub-agent session shows its own agent with its root's title.
    context.route = { type: "session", sessionID: "ses_child" }
    await until(() => shown().length === 3)
    expect(fields(herdr!.requests[2]!)).toEqual({ title: ROOT, display_agent: "explore", clear: false })

    // Back to the root, then a prompt with another agent.
    context.route = { type: "session", sessionID: "ses_root" }
    await until(() => shown().length === 4)
    expect(fields(herdr!.requests[3]!)).toEqual({ title: ROOT, display_agent: "build", clear: false })
    context.sessions.set("ses_root", { id: "ses_root", title: ROOT, agent: "plan" })
    await until(() => shown().length === 5)
    expect(fields(herdr!.requests[4]!)).toEqual({ title: ROOT, display_agent: "plan", clear: false })

    context.sessions.set("ses_root", { id: "ses_root", title: RENAMED, agent: "plan" })
    await until(() => shown().length === 6)
    expect(fields(herdr!.requests[5]!)).toEqual({ title: RENAMED, display_agent: "plan", clear: false })

    context.sessions.set("ses_root", { id: "ses_root", title: "L".repeat(100), agent: "plan" })
    await until(() => shown().length === 7)
    const longTitle = herdr!.requests[6]!.params["title"] as string
    expect([...longTitle].length).toBe(80)
    expect(longTitle.endsWith("…")).toBe(true)
    expect(herdr!.requests[6]!.params["display_agent"]).toBe("plan")

    context.route = { type: "session", sessionID: "ses_other" }
    await until(() => shown().length === 8)
    expect(fields(herdr!.requests[7]!)).toEqual({ title: OTHER, display_agent: "plan", clear: false })

    cleanup()
    await until(() => shown().length === 9)
    expect(fields(herdr!.requests[8]!).clear).toBe(true)

    expect(herdr!.requests.every((request) => request.method === "pane.report_metadata")).toBe(true)
    expect(new Set(herdr!.requests.map((request) => request.params["pane_id"]))).toEqual(new Set(["w4:p2"]))
  }, 30_000)

  it("sends again when Herdr refused, garbled its answer, hung up, stayed silent or was gone [UC-7][UC-7N]", async () => {
    const context = fakeTuiContext()
    context.sessions.set("ses_a", { id: "ses_a", title: "Kept", agent: "build" })
    context.route = { type: "session", sessionID: "ses_a" }
    const answers = ["error", "garbage", "close", "silent"] as const
    herdr!.answer = answers[0]
    const cleanup = (await loadTui()).setup(context)
    for (const [index, answer] of answers.entries()) {
      herdr!.answer = answer
      await until(() => herdr!.requests.length > index)
    }
    // The silent answer times out after a second; then Herdr goes away, so the
    // reports after it find no socket.
    expect(herdr!.requests).toHaveLength(answers.length)
    expect(new Set(shown())).toEqual(new Set(["Kept"]))
    expect(herdr!.requests.every((request) => request.params["display_agent"] === "build")).toBe(true)
    await Bun.sleep(1200)
    await herdr!.stop()
    herdr = undefined
    await Bun.sleep(1500)
    cleanup()
    await Bun.sleep(100)
  }, 30_000)

  it("sends an unchanged presentation again every ten seconds, for a Herdr that had not recognised OpenCode yet [UC-7]", async () => {
    const context = fakeTuiContext()
    context.sessions.set("ses_a", { id: "ses_a", title: "Kept", agent: "build" })
    context.route = { type: "session", sessionID: "ses_a" }
    const cleanup = (await loadTui()).setup(context)
    await until(() => shown().length === 1)
    expect(fields(herdr!.requests[0]!)).toEqual({ title: "Kept", display_agent: "build", clear: false })
    await until(() => shown().length === 2, 12_000)
    expect(fields(herdr!.requests[1]!)).toEqual({ title: "Kept", display_agent: "build", clear: false })
    cleanup()
    await until(() => shown().length === 3)
    expect(shown()).toEqual(["Kept", "Kept", "cleared"])
  }, 30_000)

  it("shows a session without an agent by its title alone, then its agent once a prompt records it [UC-5][UC-5N]", async () => {
    const context = fakeTuiContext()
    context.sessions.set("ses_r", { id: "ses_r", title: "T" })
    context.route = { type: "session", sessionID: "ses_r" }
    const cleanup = (await loadTui()).setup(context)
    await until(() => shown().length === 1)
    expect(herdr!.requests[0]!.params["title"]).toBe("T")
    expect("display_agent" in herdr!.requests[0]!.params).toBe(false)

    context.sessions.set("ses_r", { id: "ses_r", title: "T", agent: "build" })
    await until(() => shown().length === 2)
    expect(fields(herdr!.requests[1]!)).toEqual({ title: "T", display_agent: "build", clear: false })

    context.sessions.set("ses_r", { id: "ses_r", title: " " })
    await until(() => shown().length === 3)
    expect(fields(herdr!.requests[2]!).clear).toBe(true)

    cleanup()
    await Bun.sleep(300)
    expect(herdr!.requests).toHaveLength(3)
  }, 30_000)

  it("sends nothing for a session that is not loaded yet, or for a parent chain that loops [UC-1N][UC-2N]", async () => {
    const context = fakeTuiContext()
    const cleanup = (await loadTui()).setup(context)
    await until(() => shown().length === 1)
    expect(fields(herdr!.requests[0]!).clear).toBe(true)

    context.route = { type: "session", sessionID: "ses_missing" }
    await Bun.sleep(600)
    expect(herdr!.requests).toHaveLength(1)

    context.sessions.set("ses_loop_a", { id: "ses_loop_a", parentID: "ses_loop_b" })
    context.sessions.set("ses_loop_b", { id: "ses_loop_b", parentID: "ses_loop_a" })
    context.route = { type: "session", sessionID: "ses_loop_a" }
    await Bun.sleep(600)
    expect(herdr!.requests).toHaveLength(1)

    cleanup()
    await Bun.sleep(300)
    expect(herdr!.requests).toHaveLength(1)
  }, 30_000)

  it("resends nothing unchanged, keeps the agent when the title goes blank, treats a route without an id as home, and sends nothing more on exit from home [UC-3N][UC-4N][UC-6N][UC-8N]", async () => {
    const context = fakeTuiContext()
    context.sessions.set("ses_r", { id: "ses_r", title: "T", agent: "plan" })
    context.route = { type: "session", sessionID: "ses_r" }
    const cleanup = (await loadTui()).setup(context)
    await until(() => shown().length === 1)
    expect(fields(herdr!.requests[0]!)).toEqual({ title: "T", display_agent: "plan", clear: false })
    await Bun.sleep(600)
    expect(herdr!.requests).toHaveLength(1)

    context.sessions.set("ses_r", { id: "ses_r", title: " ", agent: "plan" })
    await until(() => shown().length === 2)
    expect(herdr!.requests[1]!.params["display_agent"]).toBe("plan")
    expect("title" in herdr!.requests[1]!.params).toBe(false)

    context.route = { type: "session" }
    await until(() => shown().length === 3)
    expect(fields(herdr!.requests[2]!).clear).toBe(true)

    cleanup()
    await Bun.sleep(300)
    expect(herdr!.requests).toHaveLength(3)
  }, 30_000)
})
