import { afterEach, describe, expect, it } from "bun:test"
import { createTestRenderer, type TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/solid"
import { createBrowser } from "@session-manager/domain/model/Browser"
import {
  BrowserView,
  DETAIL_HEIGHT,
  listHeightFor,
  showBrowser,
  terminalRenderer,
} from "@session-manager/infrastructure/adapters/inbound/manager-tui/OpenTuiBrowser"
import type { BrowserControls } from "@session-manager/infrastructure/adapters/inbound/manager-tui/controls"
import { opened, session } from "@test/support/sessions/catalogs"
import { waitForText } from "@test/support/sessions/frames"
import { silentTerminal } from "@test/support/sessions/terminal-streams"

const T = Date.UTC(2026, 9, 8, 9, 30)
const left = opened(
  "left",
  Array.from({ length: 30 }, (_, index) => session({ id: `ses_l${String(index).padStart(2, "0")}`, directory: index < 3 ? "/w/a" : "/w/b", updated: T - index, title: `Left ${index}` })),
)
const right = opened("right", [session({ id: "ses_l00", directory: "C:/a", updated: T + 5, title: "Right zero", context: { compartments: 7 } })], { snapshot: "/tmp/snap" })

let destroy: (() => void) | undefined
afterEach(() => {
  destroy?.()
  destroy = undefined
})

const NO_CONTROLS: BrowserControls = { apply: () => ({ result: ["not used"], changed: false, planned: {} }) }

async function paint(withRight: boolean, size = { width: 120, height: 30 }) {
  let quits = 0
  const setup = await testRender(
    () => <BrowserView initial={createBrowser(left, withRight ? right : null, 1)} onQuit={() => quits++} controls={NO_CONTROLS} />,
    size,
  )
  destroy = () => setup.renderer.destroy()
  await setup.renderOnce()
  return { setup, quits: () => quits }
}

const frame = async (setup: TestRendererSetup) => {
  await setup.renderOnce()
  return setup.captureCharFrame()
}

describe("BrowserView", () => {
  it("lays out two panes, the details and the footer for the terminal height", async () => {
    const { setup } = await paint(true)
    const lines = (await frame(setup)).split("\n")
    expect(listHeightFor(30)).toBe(30 - DETAIL_HEIGHT - 1 - 2)
    expect(listHeightFor(3)).toBe(1)
    expect(lines[0]).toContain("left · 30 sessions · Magic Context format 94")
    expect(lines[0]).toContain("right (snapshot) · 1 sessions")
    expect(lines[1]).toContain("▾ /w/a (3)")
    expect(lines[1]).toContain("▾ C:/a (1)")
    expect(lines[2]).toContain("< Left 0")
    expect(lines[2]).toContain("> Right zero")
    expect(lines.filter((line) => line.includes("+ Left")).length).toBe(listHeightFor(30) - 3)
    expect(lines.some((line) => line.includes("Folder /w/a"))).toBe(true)
    expect(lines[29]).toContain("Tab pane · p pair")
    expect(lines[22]).toContain("Details · + only here")
  })

  it("moves, switches panes, filters and quits from the keyboard", async () => {
    const { setup, quits } = await paint(true)
    setup.mockInput.pressArrow("down")
    expect(await frame(setup)).toContain("ses_l00 · v2 · project proj")
    setup.mockInput.pressTab()
    expect(await frame(setup)).toContain("│ C:/a ")
    setup.mockInput.pressKey("/")
    await setup.mockInput.typeText("Left 2")
    expect(await frame(setup)).toContain("filter: Left 2▏")
    setup.mockInput.pressEnter()
    const filtered = await frame(setup)
    expect(filtered).toContain('filter "Left 2"')
    expect(filtered).toContain("Left 29")
    expect(filtered).not.toContain("Left 5 ")
    setup.mockInput.pressKey("x")
    setup.mockInput.pressKey("q")
    await frame(setup)
    expect(quits()).toBe(1)
  })

  it("selects a clicked row and scrolls a pane with the wheel", async () => {
    const { setup } = await paint(true)
    await setup.mockMouse.click(70, 2)
    expect(await frame(setup)).toContain("Magic Context: 7 summaries")
    await setup.mockMouse.scroll(10, 5, "down")
    await setup.mockMouse.scroll(10, 5, "down")
    const scrolled = (await frame(setup)).split("\n")
    expect(scrolled[1]).toContain("+ Left 4")
    await setup.mockMouse.scroll(10, 5, "up")
    expect((await frame(setup)).split("\n")[1]).toContain("+ Left 2")
  })

  it("fills the width with one pane and follows a resize", async () => {
    const { setup } = await paint(false, { width: 90, height: 20 })
    const lines = (await frame(setup)).split("\n")
    expect(lines[0]).toContain("left · 30 sessions")
    expect(lines[0]).not.toContain("right")
    expect(lines[19]).not.toContain("Tab")
    setup.resize(90, 14)
    const small = (await frame(setup)).split("\n")
    expect(small.filter((line) => line.includes("Left ")).length).toBe(listHeightFor(14) - 1)
  })
})

describe("BrowserView pairing and the queue", () => {
  it("pairs sessions by id, marks and queues a sync, and shows the queue", async () => {
    const { setup } = await paint(true)
    setup.mockInput.pressKey("p")
    const pairedFrame = await frame(setup)
    expect(pairedFrame).toContain("paired by session id")
    expect(pairedFrame).toContain("< Left 0")
    setup.mockInput.pressArrow("down")
    setup.mockInput.pressKey(" ")
    expect(await frame(setup)).toContain("● < Left 0")
    setup.mockInput.pressKey("<")
    expect(await frame(setup)).toContain("Queued 1 session sync ←.")
    await setup.mockMouse.click(10, 3)
    expect(await frame(setup)).toContain("ses_l01 · only on the left")
    await setup.mockMouse.scroll(10, 5, "down")
    setup.mockInput.pressKey("Q")
    expect(await frame(setup)).toContain("← Right zero")
    setup.mockInput.pressEscape()
    setup.mockInput.pressKey("p")
    expect(await frame(setup)).not.toContain("paired by session id")
  })

  it("lists queued syncs, checks them, shows what each does, then applies them", async () => {
    const both = opened("left", [session({ id: "ses_x", directory: "/w", updated: T, title: "Both", context: {} })])
    const other = opened("right", [session({ id: "ses_x", directory: "C:/w", updated: T, context: {} })])
    const calls: string[] = []
    const fresh = opened("left", [session({ id: "ses_x", directory: "/w", updated: T, title: "Both", context: { compartments: 42 } })])
    const controls: BrowserControls = {
      apply: (queue, dryRun, scope) => {
        calls.push(`${dryRun ? "check" : "apply"} ${queue.length} ${queue[0]!.prefer} ${scope}`)
        const planned = { ses_x: { action: "keep" as const, relation: "same" as const, reason: null, context: "Magic Context copied" } }
        return dryRun
          ? { result: ["Dry run: fine", "line 2"], changed: false, planned }
          : { result: ["Applied: done", "line 2"], changed: true, planned, left: fresh, right: other }
      },
    }
    const setup = await testRender(() => <BrowserView initial={createBrowser(both, other, 1)} onQuit={() => {}} controls={controls} />, { width: 120, height: 20 })
    destroy = () => setup.renderer.destroy()
    setup.mockInput.pressArrow("down")
    setup.mockInput.pressKey(">")
    setup.mockInput.pressKey("Q")
    const queued = await frame(setup)
    expect(queued).toContain("Queue · 1 session sync · 0 new on the target · Magic Context: sessions and their projects")
    expect(queued).toContain("→ Both")
    expect(queued).toContain("further both: d to check")
    setup.mockInput.pressKey("r")
    setup.mockInput.pressKey("t")
    expect(await frame(setup)).toContain("keep    both: d to check")
    setup.mockInput.pressKey("d")
    setup.mockInput.pressKey("a")
    expect(await frame(setup)).toContain("Checking the queue on copies…")
    expect(await waitForText(setup, "same: context only")).toContain("Dry run: fine")
    setup.mockInput.pressKey("a")
    expect(await waitForText(setup, "Applied: done")).toContain("line 2")
    expect(calls).toEqual(["check 1 keep sessions", "apply 1 keep sessions"])
    setup.mockInput.pressEscape()
    expect(await waitForText(setup, "S42")).toContain("Both")
  })
})

describe("showBrowser", () => {
  it("paints on the renderer it is given, resolves on quit and destroys the renderer", async () => {
    const setup = await createTestRenderer({ width: 100, height: 24 })
    const shown = showBrowser(async () => setup.renderer)(createBrowser(left, null, 1), NO_CONTROLS)
    await setup.waitForFrame((text) => text.includes("Left 0"))
    setup.mockInput.pressKey("q")
    await shown
    expect(setup.renderer.isDestroyed).toBe(true)
  })

  it("opens a full-screen terminal renderer with the mouse on", async () => {
    const renderer = await terminalRenderer({ ...silentTerminal(80, 24), bufferedOutput: "memory" })
    try {
      expect(renderer.useMouse).toBe(true)
    } finally {
      renderer.destroy()
    }
  })
})
