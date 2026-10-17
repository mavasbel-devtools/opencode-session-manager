// E2E tier: the Herdr pane title, from the real v2 TUI entry found and loaded by
// the real OpenCode 2.0.14 plugin host (`Host.resolve` + `Host.load`), through
// the composition root, the use case and the socket adapter, to a Unix socket
// in this process, so coverage is measured. The plugin reads its environment
// itself, as in production: this test sets HERDR_* to the stand-in socket and
// takes them away afterwards (the test preload keeps the user's Herdr out).
//
// Stand-ins: the TUI's router and synced session data (owned by the host's TUI
// app) and Herdr's socket (`tests/support/fakes/herdr-socket.ts`, which answers
// like Herdr's API). The live tier runs the real OpenCode TUI in a real Herdr.
import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import path from "node:path"
import { Host } from "@opencode/plugin/host"
import type { V2TuiContext } from "@session-manager/infrastructure/host/V2TuiContext"
import { fakeTuiContext } from "@test/support/fakes/hosts"
import { startFakeHerdr, type FakeHerdr } from "@test/support/fakes/herdr-socket"

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

describe("Herdr pane title through the real 2.0.14 host", () => {
  it("follows the TUI: home, a session, its sub-agent, a rename, a long title, another session, then exit", async () => {
    const context = fakeTuiContext()
    context.sessions.set("ses_root", { id: "ses_root", title: "Overleaf & ResearchGate Lean Formalization" })
    context.sessions.set("ses_task", { id: "ses_task", parentID: "ses_root", title: "explore subagent" })
    context.sessions.set("ses_loop_a", { id: "ses_loop_a", parentID: "ses_loop_b" })
    context.sessions.set("ses_loop_b", { id: "ses_loop_b", parentID: "ses_loop_a" })
    const cleanup = (await loadTui()).setup(context)
    await until(() => shown().length === 1)
    // A session not synced yet, and a broken parent chain, leave the pane as it is.
    context.route = { type: "session", sessionID: "ses_not_synced" }
    await Bun.sleep(300)
    context.route = { type: "session", sessionID: "ses_loop_a" }
    await Bun.sleep(300)
    expect(shown()).toHaveLength(1)

    context.route = { type: "session", sessionID: "ses_root" }
    await until(() => shown().length === 2)
    // A sub-agent session keeps its root's title: nothing new is sent.
    context.route = { type: "session", sessionID: "ses_task" }
    await Bun.sleep(600)
    context.sessions.set("ses_root", { id: "ses_root", title: "Lean formalization, renamed" })
    await until(() => shown().length === 3)
    context.sessions.set("ses_root", { id: "ses_root", title: `Claude course recommendations - Relational DBs - ${"generators ".repeat(5)}` })
    await until(() => shown().length === 4)
    context.sessions.set("ses_other", { id: "ses_other", title: "Unified LLM endpoint" })
    context.route = { type: "session", sessionID: "ses_other" }
    await until(() => shown().length === 5)
    cleanup()
    await until(() => shown().length === 6)

    expect(shown()).toEqual([
      "cleared",
      "Overleaf & ResearchGate Lean Formalization",
      "Lean formalization, renamed",
      "Claude course recommendations - Relational DBs - generators generators generato…",
      "Unified LLM endpoint",
      "cleared",
    ])
    expect(new Set(herdr!.requests.map((request) => request.params["pane_id"]))).toEqual(new Set(["w4:p2"]))
    expect(herdr!.requests.every((request) => request.method === "pane.report_metadata")).toBe(true)
    expect(herdr!.requests[1]!.params["display_agent"]).toBe("Overleaf & ResearchGate Lean Formalization")
  }, 30_000)

  it("sends a title again when Herdr refused it, garbled its answer, hung up, stayed silent or was gone", async () => {
    const context = fakeTuiContext()
    context.sessions.set("ses_a", { id: "ses_a", title: "Kept" })
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
    await Bun.sleep(1200)
    await herdr!.stop()
    herdr = undefined
    await Bun.sleep(1500)
    cleanup()
    await Bun.sleep(100)
  }, 30_000)

  it("sends an unchanged title again every ten seconds, for a Herdr that had not recognised OpenCode yet", async () => {
    const context = fakeTuiContext()
    context.sessions.set("ses_a", { id: "ses_a", title: "Kept" })
    context.route = { type: "session", sessionID: "ses_a" }
    const cleanup = (await loadTui()).setup(context)
    await until(() => shown().length === 1)
    await until(() => shown().length === 2, 12_000)
    cleanup()
    await until(() => shown().length === 3)
    expect(shown()).toEqual(["Kept", "Kept", "cleared"])
  }, 30_000)
})
