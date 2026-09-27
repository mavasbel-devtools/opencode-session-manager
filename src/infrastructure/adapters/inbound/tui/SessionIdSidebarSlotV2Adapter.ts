import type { JSX } from "@opentui/solid"
import type { RenderSidebarEntryPort } from "@session-id/domain/ports/inbound/RenderSidebarEntryPort"
import { SIDEBAR_CONTENT_SLOT, type V2TuiContext } from "@session-id/infrastructure/host/V2TuiContext"

/**
 * Builds the renderer for one host context. The context arrives at registration
 * time, after the composition root has run, so the root passes this factory
 * instead of an instance and stays the only place that wires concrete classes.
 */
export type SidebarRendererFactory = (context: V2TuiContext) => RenderSidebarEntryPort<JSX.Element>

/**
 * OpenCode 2 inbound adapter: prepends the session ID to `sidebar.content`,
 * the first row of the sidebar's scroll area, directly under the title
 * (packages/tui/src/routes/session/sidebar.tsx; prepend order in
 * packages/tui/src/plugin/render.tsx).
 */
export class SessionIdSidebarSlotV2Adapter {
  constructor(private readonly renderer: SidebarRendererFactory) {}

  register(context: V2TuiContext): () => void {
    const renderer = this.renderer(context)
    return context.ui.slot({
      prepend: SIDEBAR_CONTENT_SLOT,
      render: (input) => renderer.render(input),
    })
  }
}
