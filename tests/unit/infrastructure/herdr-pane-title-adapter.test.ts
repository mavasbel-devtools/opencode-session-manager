import { describe, expect, it } from "bun:test"
import type { ReportPaneTitlePort } from "@session-manager/domain/ports/inbound/ReportPaneTitlePort"
import type { PanePresentation } from "@session-manager/domain/model/PaneTitle"
import { HerdrPaneTitleV2Adapter } from "@session-manager/infrastructure/adapters/inbound/tui/HerdrPaneTitleV2Adapter"
import { fakeTuiContext } from "@test/support/fakes/hosts"

/** Inbound stand-in: records what the adapter asked for. */
class RecordingTitles implements ReportPaneTitlePort {
  readonly calls: string[] = []

  constructor() {}

  report(p: PanePresentation | undefined): Promise<void> {
    this.calls.push(p === undefined ? "report:undefined" : `report:${p.agent}|${p.title}`)
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
  it("[UC-6] reports nothing open on the home screen, at once", () => {
    const titles = new RecordingTitles()
    const cleanup = new HerdrPaneTitleV2Adapter(titles, SLOW).register(fakeTuiContext())
    expect(titles.calls).toEqual(["report:undefined"])
    cleanup()
  })

  it("[UC-1] reports the open session's agent and its title", () => {
    const context = fakeTuiContext()
    context.sessions.set("ses_root", { id: "ses_root", title: "Lean Formalization", agent: "plan" })
    context.route = { type: "session", sessionID: "ses_root" }
    const titles = new RecordingTitles()
    const cleanup = new HerdrPaneTitleV2Adapter(titles, SLOW).register(context)
    expect(titles.calls).toEqual(["report:plan|Lean Formalization"])
    cleanup()
  })

  it("[UC-2] reports a sub-agent session's own agent with its root's title", () => {
    const context = fakeTuiContext()
    context.sessions.set("ses_root", { id: "ses_root", title: "Lean Formalization", agent: "plan" })
    context.sessions.set("ses_child", { id: "ses_child", parentID: "ses_root", title: "explore task", agent: "explore" })
    context.route = { type: "session", sessionID: "ses_child" }
    const titles = new RecordingTitles()
    const cleanup = new HerdrPaneTitleV2Adapter(titles, SLOW).register(context)
    expect(titles.calls).toEqual(["report:explore|Lean Formalization"])
    cleanup()
  })

  it("[UC-5] reports an open session without an agent by its title alone", () => {
    const context = fakeTuiContext()
    context.sessions.set("ses_root", { id: "ses_root", title: "Lean Formalization" })
    context.route = { type: "session", sessionID: "ses_root" }
    const titles = new RecordingTitles()
    const cleanup = new HerdrPaneTitleV2Adapter(titles, SLOW).register(context)
    expect(titles.calls).toEqual(["report:undefined|Lean Formalization"])
    cleanup()
  })

  it("[UC-1N][UC-6N] reports nothing while the open session is not loaded yet, and treats a route without a session as home", () => {
    const context = fakeTuiContext()
    context.route = { type: "session", sessionID: "ses_missing" }
    const titles = new RecordingTitles()
    const cleanup = new HerdrPaneTitleV2Adapter(titles, SLOW).register(context)
    expect(titles.calls).toEqual([])
    context.route = { type: "session" }
    const other = new RecordingTitles()
    const cleanupOther = new HerdrPaneTitleV2Adapter(other, SLOW).register(context)
    expect(other.calls).toEqual(["report:undefined"])
    cleanup()
    cleanupOther()
  })

  it("[UC-2N] reports nothing for a parent chain that loops", () => {
    const context = fakeTuiContext()
    context.sessions.set("a", { id: "a", parentID: "b" })
    context.sessions.set("b", { id: "b", parentID: "a" })
    context.route = { type: "session", sessionID: "a" }
    const titles = new RecordingTitles()
    const cleanup = new HerdrPaneTitleV2Adapter(titles, SLOW).register(context)
    expect(titles.calls).toEqual([])
    cleanup()
  })

  it("[UC-3][UC-4] follows an agent change and a rename on the next read, refreshing every refreshEvery reads", async () => {
    const context = fakeTuiContext()
    context.sessions.set("ses_root", { id: "ses_root", title: "T", agent: "build" })
    context.route = { type: "session", sessionID: "ses_root" }
    const titles = new RecordingTitles()
    const cleanup = new HerdrPaneTitleV2Adapter(titles, { pollMilliseconds: 5, refreshEvery: 3 }).register(context)
    await sleep(30)
    context.sessions.set("ses_root", { id: "ses_root", title: "T", agent: "plan" })
    await sleep(30)
    context.sessions.set("ses_root", { id: "ses_root", title: "U", agent: "plan" })
    await sleep(30)
    cleanup()
    const reads = titles.calls.filter((call) => call !== "refresh" && call !== "release")
    expect(reads).toContain("report:build|T")
    expect(reads).toContain("report:plan|T")
    expect(reads).toContain("report:plan|U")
    expect(reads.indexOf("report:build|T")).toBeLessThan(reads.indexOf("report:plan|T"))
    expect(reads.indexOf("report:plan|T")).toBeLessThan(reads.indexOf("report:plan|U"))
    expect(titles.calls).toContain("refresh")
    const count = titles.calls.length
    await sleep(50)
    expect(titles.calls).toHaveLength(count)
    expect(titles.calls.at(-1)).toBe("release")
  })
})
