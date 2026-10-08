import type { RGBA } from "@opentui/core"
import type { JSX } from "@opentui/solid"
import type { SidebarSlotInput } from "@session-manager/domain/ports/inbound/RenderSidebarEntryPort"
import type { V2Client } from "@session-manager/infrastructure/host/V2Client"

/** Colours the OpenCode 2 theme hands to a plugin (`@opencode/theme`: hex string or RGBA). */
export type HostColor = RGBA | string

/** The first row of the sidebar's scroll area, directly under the title. */
export const SIDEBAR_CONTENT_SLOT = "sidebar.content"

/** The app-level slot whose render runs inside the component tree (where `keymap.layer` works). */
export const APP_SLOT = "app"

export interface V2SidebarClaim {
  readonly prepend: typeof SIDEBAR_CONTENT_SLOT
  readonly render: (input: SidebarSlotInput) => JSX.Element
}

export interface V2AppClaim {
  readonly append: typeof APP_SLOT
  readonly render: () => null
}

export type V2SlotClaim = V2SidebarClaim | V2AppClaim

export interface V2SelectOption<Value> {
  readonly title: string
  readonly value: Value
  readonly description?: string
  readonly footer?: string
  readonly category?: string
}

export interface V2KeymapLayer {
  readonly mode: "global"
  readonly commands: ReadonlyArray<{
    readonly id: string
    readonly title: string
    readonly description: string
    readonly group: string
    readonly palette: true
    readonly slash: { readonly name: string; readonly aliases: string[] }
    readonly run: () => void
  }>
}

/**
 * The slice of the OpenCode 2 TUI plugin context (`@opencode/plugin/tui`
 * `Context`, dist/tui/context.d.ts in v2.0.14) this plugin uses, declared
 * structurally so the bundle carries no `@opencode/*` runtime import.
 */
export interface V2TuiContext {
  readonly theme: { readonly text: { readonly muted: HostColor } }
  readonly client: V2Client
  readonly keymap: {
    layer(input: () => V2KeymapLayer): void
  }
  readonly ui: {
    slot(claim: V2SlotClaim): () => void
    readonly dialog: {
      select<Value>(options: {
        readonly title: string
        readonly placeholder?: string
        readonly options: ReadonlyArray<V2SelectOption<Value>>
      }): Promise<Value | undefined>
      prompt(options: {
        readonly title: string
        readonly description?: string
        readonly placeholder?: string
      }): Promise<string | undefined>
    }
    readonly toast: {
      show(options: {
        readonly title?: string
        readonly message: string
        readonly variant?: "info" | "success" | "warning" | "error"
        readonly duration?: number
      }): void
    }
    readonly router: {
      current(): { readonly type: string; readonly sessionID?: string }
    }
  }
}
