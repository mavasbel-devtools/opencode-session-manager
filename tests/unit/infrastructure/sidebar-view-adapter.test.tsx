// The view adapter is the one class that cannot be exercised without a renderer:
// @opentui/solid's reconciler throws "No renderer found" when an element is
// created outside one (node_modules/@opentui/solid/src/reconciler.ts:198). The
// renderer here is the framework's own test renderer, the smallest thing that
// makes the class runnable at all — the class under test is still alone.
import { describe, expect, it } from "bun:test"
import { testRender } from "@opentui/solid"
import { OpenTuiSidebarViewAdapter } from "@session-manager/infrastructure/adapters/outbound/tui/OpenTuiSidebarViewAdapter"

describe("OpenTuiSidebarViewAdapter", () => {
  it("paints the entry's text in the entry's colour, reading both only at paint time", async () => {
    let textReads = 0
    let colorReads = 0
    const entry = {
      get text() {
        textReads++
        return "ses_0123456789abCDEFGHIJKLMNOP"
      },
      get color() {
        colorReads++
        return "#808080"
      },
    }

    const adapter = new OpenTuiSidebarViewAdapter()
    const render = await testRender(() => adapter.render(entry) as never, { width: 40, height: 2 })
    await render.renderOnce()

    const span = render.captureSpans().lines[0]!.spans.find((value) => value.text.includes("ses_"))!
    const fg = `#${span.fg.toInts().slice(0, 3).map((value) => value.toString(16).padStart(2, "0")).join("")}`
    expect({ line: render.captureCharFrame().split("\n")[0]!.trimEnd(), fg }).toEqual({
      line: "ses_0123456789abCDEFGHIJKLMNOP",
      fg: "#808080",
    })
    // Read through the Solid bindings, not copied into the element up front.
    expect({ textReads: textReads > 0, colorReads: colorReads > 0 }).toEqual({ textReads: true, colorReads: true })
    render.renderer.destroy()
  }, 30_000)
})
