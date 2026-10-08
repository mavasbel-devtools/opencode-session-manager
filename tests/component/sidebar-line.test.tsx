// COMPONENT tier: the whole wired plugin (composition root, use case, both
// outbound adapters, inbound slot adapter) painted by the real OpenTUI 0.5.10
// renderer — the version OpenCode 2.0.14 pins — at the real sidebar width.
import { afterEach, describe, expect, it } from "bun:test"
import { RGBA } from "@opentui/core"
import { testRender } from "@opentui/solid"
import { createSignal } from "solid-js"
import tui from "@session-manager/main/v2/tui"
import type { HostColor } from "@session-manager/infrastructure/host/V2TuiContext"
import { fakeTuiContext } from "@test/support/fakes/hosts"

let destroy: (() => void) | undefined
afterEach(() => {
  destroy?.()
  destroy = undefined
})

// 42 = SESSION_SIDEBAR_WIDTH in packages/tui/src/ui/layout.ts; content width is
// 42 - 2 (border) - 2 (padding) - 1 (scroll reserve) = 37.
const SIDEBAR_CONTENT_WIDTH = 37
const ID = "ses_0123456789abCDEFGHIJKLMNOP"

const hex = (color: RGBA) =>
  `#${color
    .toInts()
    .slice(0, 3)
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("")}`

describe("the sidebar line, end to end inside the process", () => {
  it("paints the session ID on one line at the sidebar content width, in the theme's muted RGBA", async () => {
    const context = fakeTuiContext(RGBA.fromHex("#808080"))
    const dispose = tui.setup(context)
    const claim = context.claims[0]!

    const render = await testRender(() => claim.render({ sessionID: ID }), { width: SIDEBAR_CONTENT_WIDTH, height: 3 })
    destroy = () => render.renderer.destroy()
    await render.renderOnce()

    const lines = render.captureCharFrame().split("\n")
    expect(lines[0]!.trimEnd()).toBe(ID)
    // One line only: the ID must not wrap into the row below.
    expect(lines[1]!.trim()).toBe("")
    const span = render.captureSpans().lines[0]!.spans.find((entry) => entry.text.includes(ID))!
    expect(hex(span.fg)).toBe("#808080")

    dispose()
    // One disposer removes both claims: the sidebar line and the transfer command's app slot.
    expect(context.disposed).toHaveLength(2)
  }, 30_000)

  it("repaints in place when the session changes and when the theme changes", async () => {
    const [muted, setMuted] = createSignal<HostColor>("#808080")
    const [session, setSession] = createSignal("ses_first")
    const context = {
      claims: [] as Array<{ render: (input: { sessionID: string }) => unknown }>,
      theme: {
        text: {
          get muted() {
            return muted()
          },
        },
      },
      ui: {
        slot(claim: { render: (input: { sessionID: string }) => unknown }) {
          context.claims.push(claim)
          return () => undefined
        },
      },
    }
    tui.setup(context as never)

    const render = await testRender(
      () =>
        context.claims[0]!.render({
          get sessionID() {
            return session()
          },
        }) as never,
      { width: SIDEBAR_CONTENT_WIDTH, height: 3 },
    )
    destroy = () => render.renderer.destroy()
    await render.renderOnce()
    expect(render.captureCharFrame()).toContain("ses_first")

    setSession("ses_second")
    setMuted("#ff0000")
    await render.renderOnce()
    const frame = render.captureCharFrame()
    expect(frame).toContain("ses_second")
    expect(frame).not.toContain("ses_first")
    const span = render.captureSpans().lines[0]!.spans.find((entry) => entry.text.includes("ses_second"))!
    expect(hex(span.fg)).toBe("#ff0000")
  }, 30_000)
})
