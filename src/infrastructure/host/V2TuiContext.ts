import type { RGBA } from "@opentui/core"
import type { JSX } from "@opentui/solid"
import type { SidebarSlotInput } from "@session-id/domain/ports/inbound/RenderSidebarEntryPort"

/** Colours the OpenCode 2 theme hands to a plugin (`@opencode/theme`: hex string or RGBA). */
export type HostColor = RGBA | string

/** The one slot path this plugin claims: the first row of the sidebar's scroll area. */
export const SIDEBAR_CONTENT_SLOT = "sidebar.content"

export interface V2SidebarClaim {
  readonly prepend: typeof SIDEBAR_CONTENT_SLOT
  readonly render: (input: SidebarSlotInput) => JSX.Element
}

/**
 * The slice of the OpenCode 2 TUI plugin context (`@opencode/plugin/tui`
 * `Context`, dist/tui/context.d.ts in v2.0.14) this plugin uses, declared
 * structurally so the bundle carries no `@opencode/*` runtime import.
 */
export interface V2TuiContext {
  readonly theme: { readonly text: { readonly muted: HostColor } }
  readonly ui: {
    slot(claim: V2SidebarClaim): () => void
  }
}
