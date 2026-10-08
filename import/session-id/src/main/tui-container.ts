import { RenderSidebarEntryUseCase } from "@session-id/application/RenderSidebarEntryUseCase"
import { SessionIdSidebarSlotV2Adapter } from "@session-id/infrastructure/adapters/inbound/tui/SessionIdSidebarSlotV2Adapter"
import { HostThemePaletteV2Adapter } from "@session-id/infrastructure/adapters/outbound/tui/HostThemePaletteV2Adapter"
import { OpenTuiSidebarViewAdapter } from "@session-id/infrastructure/adapters/outbound/tui/OpenTuiSidebarViewAdapter"

/**
 * Composition root of the TUI runtime: the only place that wires concrete
 * adapters for the sidebar side.
 *
 * The renderer is wired as a factory because the host context — and with it the
 * theme — only exists at registration time, after this root has run.
 */
export function createTuiContainer(): { readonly sidebar: SessionIdSidebarSlotV2Adapter } {
  return {
    sidebar: new SessionIdSidebarSlotV2Adapter(
      (context) => new RenderSidebarEntryUseCase(new HostThemePaletteV2Adapter(context), new OpenTuiSidebarViewAdapter()),
    ),
  }
}
