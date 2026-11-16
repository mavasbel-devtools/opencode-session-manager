import { describe, expect, it } from "bun:test"
import { ReportPaneTitleUseCase } from "@session-manager/application/ReportPaneTitleUseCase"
import type { PaneMetadataPort } from "@session-manager/domain/ports/outbound/PaneMetadataPort"
import type { PanePresentation } from "@session-manager/domain/model/PaneTitle"

/** Outbound stand-in: records what the pane was told and answers as set. */
class FakePane implements PaneMetadataPort {
  readonly calls: string[] = []
  accepts = true
  throws = false

  constructor() {}

  async show(p: PanePresentation): Promise<boolean> {
    return this.answer(`show:${p.agent ?? "-"}|${p.title ?? "-"}`)
  }

  async clear(): Promise<boolean> {
    return this.answer("clear")
  }

  private answer(call: string): boolean {
    this.calls.push(call)
    if (this.throws) throw new Error("socket gone")
    return this.accepts
  }
}

const P = (agent: string | undefined, title: string | undefined): PanePresentation => ({ agent, title })

describe("ReportPaneTitleUseCase", () => {
  it("[UC-6] sends the first report even when no session is open, so a stale presentation from before is cleared", async () => {
    const pane = new FakePane()
    await new ReportPaneTitleUseCase(pane).report(undefined)
    expect(pane.calls).toEqual(["clear"])
  })

  it("[UC-1] shows the agent and the title as Herdr will show them, and sends only changes", async () => {
    const pane = new FakePane()
    const titles = new ReportPaneTitleUseCase(pane)
    await titles.report(P("plan", "  Lean   Formalization "))
    await titles.report(P("plan", "Lean Formalization"))
    await titles.report(P("plan", "Renamed"))
    expect(pane.calls).toEqual(["show:plan|Lean Formalization", "show:plan|Renamed"])
  })

  it("[UC-3] sends a change of the agent alone", async () => {
    const pane = new FakePane()
    const titles = new ReportPaneTitleUseCase(pane)
    await titles.report(P("build", "T"))
    await titles.report(P("plan", "T"))
    expect(pane.calls).toEqual(["show:build|T", "show:plan|T"])
  })

  it("[UC-5] shows a title without an agent, then the agent once it is known", async () => {
    const pane = new FakePane()
    const titles = new ReportPaneTitleUseCase(pane)
    await titles.report(P(undefined, "T"))
    await titles.report(P("plan", "T"))
    expect(pane.calls).toEqual(["show:-|T", "show:plan|T"])
  })

  it("[UC-5N] clears when neither value is left", async () => {
    const pane = new FakePane()
    const titles = new ReportPaneTitleUseCase(pane)
    await titles.report(P("plan", "T"))
    await titles.report(P(" ", ""))
    expect(pane.calls).toEqual(["show:plan|T", "clear"])
  })

  it("[UC-7] sends a report Herdr did not take again with the next one", async () => {
    const pane = new FakePane()
    const titles = new ReportPaneTitleUseCase(pane)
    pane.accepts = false
    await titles.report(P("plan", "T"))
    pane.accepts = true
    await titles.report(P("plan", "T"))
    expect(pane.calls).toEqual(["show:plan|T", "show:plan|T"])
  })

  it("[UC-7] resends an unchanged presentation after refresh", async () => {
    const pane = new FakePane()
    const titles = new ReportPaneTitleUseCase(pane)
    await titles.report(P("plan", "T"))
    titles.refresh()
    await titles.report(P("plan", "T"))
    expect(pane.calls).toEqual(["show:plan|T", "show:plan|T"])
  })

  it("runs reports one at a time in the order they came", async () => {
    const pane = new FakePane()
    const titles = new ReportPaneTitleUseCase(pane)
    await Promise.all([titles.report(P("plan", "A")), titles.report(P("plan", "B")), titles.report(P("plan", "C"))])
    expect(pane.calls).toEqual(["show:plan|A", "show:plan|B", "show:plan|C"])
  })

  it("[UC-7N] keeps working after the port fails: the failed report rejects, the next one runs", async () => {
    const pane = new FakePane()
    const titles = new ReportPaneTitleUseCase(pane)
    pane.throws = true
    await expect(titles.report(P("plan", "T"))).rejects.toThrow("socket gone")
    pane.throws = false
    await titles.report(P("plan", "T"))
    expect(pane.calls).toEqual(["show:plan|T", "show:plan|T"])
  })

  it("[UC-8] gives the pane back its defaults on release when something is shown, once", async () => {
    const pane = new FakePane()
    const titles = new ReportPaneTitleUseCase(pane)
    await titles.report(P("plan", "T"))
    await titles.release()
    await titles.release()
    expect(pane.calls).toEqual(["show:plan|T", "clear"])
  })

  it("[UC-8] clears on release when it is not known what the pane shows", async () => {
    const pane = new FakePane()
    await new ReportPaneTitleUseCase(pane).release()
    expect(pane.calls).toEqual(["clear"])
  })

  it("[UC-8N] sends nothing on release when the pane already shows its defaults", async () => {
    const pane = new FakePane()
    const titles = new ReportPaneTitleUseCase(pane)
    await titles.report(undefined)
    await titles.release()
    expect(pane.calls).toEqual(["clear"])
  })
})
