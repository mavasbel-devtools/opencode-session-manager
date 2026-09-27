import { describe, expect, it } from "bun:test"
import { HostThemePaletteV2Adapter } from "@session-id/infrastructure/adapters/outbound/tui/HostThemePaletteV2Adapter"
import { fakeTuiContext } from "@test/support/fakes/hosts"

describe("HostThemePaletteV2Adapter", () => {
  it("reads the muted foreground from the host theme", () => {
    expect(new HostThemePaletteV2Adapter(fakeTuiContext("#abcdef")).muted()).toBe("#abcdef")
  })

  it("re-reads on every call, so a theme switch is picked up", () => {
    const context = fakeTuiContext("#111111")
    const palette = new HostThemePaletteV2Adapter(context)
    expect(palette.muted()).toBe("#111111")
    context.theme.text.muted = "#222222"
    expect(palette.muted()).toBe("#222222")
  })
})
