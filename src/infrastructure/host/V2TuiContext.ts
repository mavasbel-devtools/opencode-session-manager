import type { RGBA } from "@opentui/core"
import type { JSX } from "@opentui/solid"
import type { SessionLink } from "@session-manager/domain/model/PaneTitle"
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

export interface V2KeymapCommand {
  /** Stable command id; omitted for a key bound only while its layer is active. */
  readonly id?: string
  readonly title: string
  readonly group: string
  /** A key the command is bound to (`up`, `left`, `return`, …). */
  readonly bind?: string
  readonly palette?: true
  readonly slash?: { readonly name: string; readonly aliases?: string[] }
  readonly run: () => void
}

/** `global`: always reachable; `modal`: while a dialog is open (the host's own dialogs use it). */
export interface V2KeymapLayer {
  readonly mode: "global" | "modal"
  /** Wins over the host's layers of the same mode with a lower priority (its text input among them). */
  readonly priority?: number
  readonly commands: ReadonlyArray<V2KeymapCommand>
}

/**
 * The theme tokens this plugin reads (`@opencode/theme/tui` `ResolvedTheme`). Only `text.muted`
 * is guaranteed by every host; the rest is read with a fallback. `surface("dialog")` gives the
 * tokens of a dialog, as the host's own dialogs use.
 */
export interface V2ThemeTokens {
  readonly text: {
    readonly muted: HostColor
    readonly base?: HostColor
    readonly action?: { readonly primary?: { readonly focused?: HostColor } }
  }
  readonly background?: { readonly action?: { readonly primary?: { readonly focused?: HostColor } } }
  readonly surface?: (name: string) => V2ThemeTokens
}

/**
 * The slice of the OpenCode 2 TUI plugin context (`@opencode/plugin/tui`
 * `Context`, dist/tui/context.d.ts in v2.0.14) this plugin uses, declared
 * structurally so the bundle carries no `@opencode/*` runtime import.
 */
export interface V2TuiContext {
  readonly theme: V2ThemeTokens
  readonly client: V2Client
  /** The TUI's synced copy of the server's sessions (`Data.session.get`: `SessionInfo` — `title`, `parentID`, `agent` — or `undefined` while not loaded). */
  readonly data: {
    readonly session: {
      get(sessionID: string): SessionLink | undefined
      sync?(sessionID: string, options?: { readonly children?: boolean }): Promise<void>
    }
    on?(event: "server.connected" | "session.deleted", handler: (...args: string[]) => void): () => void
  }
  readonly keymap: {
    layer(input: () => V2KeymapLayer): void
  }
  readonly ui: {
    slot(claim: V2SlotClaim): () => void
    readonly dialog: {
      /** Shows a dialog drawn by the plugin; `onClose` runs when the host closes it (Esc, a click outside). */
      show(render: () => JSX.Element, onClose?: () => void): void
      set(options: { readonly size?: "medium" | "large" | "xlarge" }): void
      clear(): void
      select<Value>(options: {
        readonly title: string
        readonly placeholder?: string
        readonly options: ReadonlyArray<V2SelectOption<Value>>
      }): Promise<Value | undefined>
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
      navigate?(route: { readonly type: "session"; readonly sessionID: string } | { readonly type: "home" }): void
    }
  }
}
