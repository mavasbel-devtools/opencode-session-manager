import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import path from "node:path"
import {
  PANE_TITLE_AGENT,
  PANE_TITLE_SOURCE,
  HerdrSocketPaneMetadataAdapter,
} from "@session-manager/infrastructure/adapters/outbound/herdr/HerdrSocketPaneMetadataAdapter"
import { startFakeHerdr, type FakeHerdr } from "@test/support/fakes/herdr-socket"

let herdr: FakeHerdr | undefined

beforeEach(async () => {
  herdr = await startFakeHerdr()
})

afterEach(async () => {
  await herdr?.stop()
  herdr = undefined
})

const adapter = (socketPath: string, timeout = 2000) =>
  new HerdrSocketPaneMetadataAdapter({ socketPath, paneID: "w1:p7" }, "linux", timeout)

describe("HerdrSocketPaneMetadataAdapter", () => {
  it("shows a title as the pane's title and agent name, for OpenCode only, under its own source", async () => {
    expect(await adapter(herdr!.socketPath).show("Lean Formalization")).toBe(true)
    expect(herdr!.requests).toHaveLength(1)
    const request = herdr!.requests[0]!
    expect(request.method).toBe("pane.report_metadata")
    expect(request.id).toBe(`${PANE_TITLE_SOURCE}:${request.params["seq"]}`)
    expect(request.params).toEqual({
      pane_id: "w1:p7",
      source: "opencode-session-manager:title",
      agent: "opencode",
      seq: request.params["seq"],
      title: "Lean Formalization",
      display_agent: "Lean Formalization",
    })
    expect(PANE_TITLE_AGENT).toBe("opencode")
  })

  it("clears both values, handing them back to Herdr's defaults", async () => {
    expect(await adapter(herdr!.socketPath).clear()).toBe(true)
    const { seq, ...params } = herdr!.requests[0]!.params
    expect(params).toEqual({
      pane_id: "w1:p7",
      source: PANE_TITLE_SOURCE,
      agent: "opencode",
      clear_title: true,
      clear_display_agent: true,
    })
    expect(typeof seq).toBe("number")
  })

  it("numbers its reports upward, so Herdr never applies an older one after a newer one", async () => {
    const pane = adapter(herdr!.socketPath)
    await pane.show("A")
    await pane.clear()
    await pane.show("B")
    const numbers = herdr!.requests.map((request) => request.params["seq"] as number)
    expect(numbers[1]! - numbers[0]!).toBe(1)
    expect(numbers[2]! - numbers[1]!).toBe(1)
    expect(numbers[0]!).toBeGreaterThan(Date.now() * 1000 - 60_000_000)
  })

  it("reads an answer that arrives in pieces", async () => {
    herdr!.answer = "split"
    expect(await adapter(herdr!.socketPath).show("A")).toBe(true)
  })

  it("answers false when Herdr refuses, answers garbage, hangs up or stays silent", async () => {
    const answers: boolean[] = []
    for (const answer of ["error", "garbage", "close"] as const) {
      herdr!.answer = answer
      answers.push(await adapter(herdr!.socketPath).show("A"))
    }
    herdr!.answer = "silent"
    const started = Date.now()
    answers.push(await adapter(herdr!.socketPath, 150).show("A"))
    expect(Date.now() - started).toBeGreaterThanOrEqual(140)
    expect(answers).toEqual([false, false, false, false])
  })

  it("answers false when no Herdr listens", async () => {
    expect(await adapter(path.join(path.dirname(herdr!.socketPath), "none.sock")).show("A")).toBe(false)
  })

  it("talks to a Unix socket, and on Windows to the named pipe Herdr names by the socket path", () => {
    const pane = { socketPath: "herdr-default", paneID: "w1:p1" }
    expect(new HerdrSocketPaneMetadataAdapter(pane, "win32", 1).endpoint()).toBe("\\\\.\\pipe\\herdr-default")
    expect(new HerdrSocketPaneMetadataAdapter(pane, "linux", 1).endpoint()).toBe("herdr-default")
  })
})
