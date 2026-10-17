import { describe, expect, it } from "bun:test"
import type { ReportPaneTitlePort } from "@session-manager/domain/ports/inbound/ReportPaneTitlePort"
import { HerdrPaneTitleV2Adapter } from "@session-manager/infrastructure/adapters/inbound/tui/HerdrPaneTitleV2Adapter"
import { fakeTuiContext } from "@test/support/fakes/hosts"

/** Inbound stand-in: records what the adapter asked for. */
class RecordingTitles implements ReportPaneTitlePort {
  readonly calls: string[] = []

  constructor() {}

  report(title: string | undefined): Promise<void> {
    this.calls.push(`report:${title}`)
    return Promise.resolve()
  }

  refresh(): void {
    this.calls.push("refresh")
  }

  release(): Promise<void> {
    this.calls.push("release")
    return Promise.resolve()
  }
}

const SLOW = { pollMilliseconds: 60_000, refreshEvery: 1000 }
const sleep = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds))

describe("HerdrPaneTitleV2Adapter", () => {
  it("reports no title on the home screen, at once", () => {
    const titles = new RecordingTitles()
    const cleanup = new HerdrPaneTitleV2Adapter(titles, SLOW).register(fakeTuiContext())
    expect(titles.calls).toEqual(["report:undefined"])
    cleanup()
  })

  it("reports the open session's title, and its root's title for a sub-agent session", () => {
    const context = fakeTuiContext()
    context.sessions.set("ses_root", { id: "ses_root", title: "Lean Formalization" })
    context.sessions.set("ses_child", { id: "ses_child", parentID: "ses_root", title: "explore task" })
    context.route = { type: "session", sessionID: "ses_child" }
    const titles = new RecordingTitles()
    const cleanup = new HerdrPaneTitleV2Adapter(titles, SLOW).register(context)
    expect(titles.calls).toEqual(["report:Lean Formalization"])
    cleanup()
  })

  it("reports nothing while the open session is not loaded yet, and treats a route without a session as home", () => {
    const context = fakeTuiContext()
    context.route = { type: "session", sessionID: "ses_unloaded" }
    const titles = new RecordingTitles()
    new HerdrPaneTitleV2Adapter(titles, SLOW).register(context)()
    context.route = { type: "session" }
    const other = new RecordingTitles()
    new HerdrPaneTitleV2Adapter(other, SLOW).register(context)()
    expect([titles.calls, other.calls]).toEqual([["release"], ["report:undefined", "release"]])
  })

  it("follows a session switch and a rename on the next read, refreshing every refreshEvery reads", async () => {
    const context = fakeTuiContext()
    context.sessions.set("ses_a", { id: "ses_a", title: "First" })
    context.sessions.set("ses_b", { id: "ses_b", title: "Second" })
    context.route = { type: "session", sessionID: "ses_a" }
    const titles = new RecordingTitles()
    const cleanup = new HerdrPaneTitleV2Adapter(titles, { pollMilliseconds: 20, refreshEvery: 3 }).register(context)
    await sleep(30)
    context.route = { type: "session", sessionID: "ses_b" }
    await sleep(25)
    context.sessions.set("ses_b", { id: "ses_b", title: "Second, renamed" })
    await sleep(25)
    cleanup()
    const reads = titles.calls.filter((call) => call !== "refresh" && call !== "release")
    expect(reads[0]).toBe("report:First")
    expect(reads).toContain("report:Second")
    expect(reads.at(-1)).toBe("report:Second, renamed")
    expect(titles.calls.indexOf("refresh")).toBe(2)
    const count = titles.calls.length
    await sleep(50)
    expect(titles.calls).toHaveLength(count)
    expect(titles.calls.at(-1)).toBe("release")
  })
})
