import { describe, expect, it } from "bun:test"
import { ReportPaneTitleUseCase } from "@session-manager/application/ReportPaneTitleUseCase"
import type { PaneMetadataPort } from "@session-manager/domain/ports/outbound/PaneMetadataPort"

/** Outbound stand-in: records what the pane was told and answers as set. */
class FakePane implements PaneMetadataPort {
  readonly calls: string[] = []
  accepts = true
  throws = false

  constructor() {}

  async show(title: string): Promise<boolean> {
    return this.answer(`show:${title}`)
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

describe("ReportPaneTitleUseCase", () => {
  it("sends the first report even when no session is open, so a stale title from before is cleared", async () => {
    const pane = new FakePane()
    await new ReportPaneTitleUseCase(pane).report(undefined)
    expect(pane.calls).toEqual(["clear"])
  })

  it("shows the title as Herdr will show it, and sends only changes", async () => {
    const pane = new FakePane()
    const titles = new ReportPaneTitleUseCase(pane)
    await titles.report("  Lean   Formalization ")
    await titles.report("Lean Formalization")
    await titles.report("Renamed")
    await titles.report(undefined)
    await titles.report("")
    expect(pane.calls).toEqual(["show:Lean Formalization", "show:Renamed", "clear"])
  })

  it("sends a report Herdr did not take again with the next one", async () => {
    const pane = new FakePane()
    const titles = new ReportPaneTitleUseCase(pane)
    pane.accepts = false
    await titles.report("A")
    pane.accepts = true
    await titles.report("A")
    await titles.report("A")
    expect(pane.calls).toEqual(["show:A", "show:A"])
  })

  it("resends an unchanged title after refresh", async () => {
    const pane = new FakePane()
    const titles = new ReportPaneTitleUseCase(pane)
    await titles.report("A")
    titles.refresh()
    await titles.report("A")
    expect(pane.calls).toEqual(["show:A", "show:A"])
  })

  it("runs reports one at a time in the order they came", async () => {
    const pane = new FakePane()
    const titles = new ReportPaneTitleUseCase(pane)
    await Promise.all([titles.report("A"), titles.report("B"), titles.report("B"), titles.report("A")])
    expect(pane.calls).toEqual(["show:A", "show:B", "show:A"])
  })

  it("keeps working after the port fails: the failed report rejects, the next one runs", async () => {
    const pane = new FakePane()
    const titles = new ReportPaneTitleUseCase(pane)
    pane.throws = true
    await expect(titles.report("A")).rejects.toThrow("socket gone")
    pane.throws = false
    await titles.report("A")
    expect(pane.calls).toEqual(["show:A", "show:A"])
  })

  it("gives the pane back its defaults on release when a title is shown, once", async () => {
    const pane = new FakePane()
    const titles = new ReportPaneTitleUseCase(pane)
    await titles.report("A")
    await titles.release()
    await titles.release()
    expect(pane.calls).toEqual(["show:A", "clear"])
  })

  it("clears on release when it is not known what the pane shows", async () => {
    const pane = new FakePane()
    await new ReportPaneTitleUseCase(pane).release()
    expect(pane.calls).toEqual(["clear"])
  })

  it("sends nothing on release when the pane already shows its defaults", async () => {
    const pane = new FakePane()
    const titles = new ReportPaneTitleUseCase(pane)
    await titles.report(undefined)
    await titles.release()
    expect(pane.calls).toEqual(["clear"])
  })
})
