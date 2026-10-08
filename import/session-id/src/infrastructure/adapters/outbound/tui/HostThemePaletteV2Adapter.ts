import type { ThemePalettePort } from "@session-id/domain/ports/outbound/ThemePalettePort"
import type { HostColor, V2TuiContext } from "@session-id/infrastructure/host/V2TuiContext"

/**
 * Outbound adapter: reads the muted foreground from the host theme on every
 * call, so a theme switch during the session repaints the line.
 */
export class HostThemePaletteV2Adapter implements ThemePalettePort<HostColor> {
  constructor(private readonly context: V2TuiContext) {}

  muted(): HostColor {
    return this.context.theme.text.muted
  }
}
