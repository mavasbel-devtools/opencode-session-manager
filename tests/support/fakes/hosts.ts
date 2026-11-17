import type { SessionLink } from "@session-manager/domain/model/PaneTitle"
import type { SidebarEntry } from "@session-manager/domain/model/SidebarEntry"
import type { RenderSidebarEntryPort, SidebarSlotInput } from "@session-manager/domain/ports/inbound/RenderSidebarEntryPort"
import type { SidebarViewPort } from "@session-manager/domain/ports/outbound/SidebarViewPort"
import type { ThemePalettePort } from "@session-manager/domain/ports/outbound/ThemePalettePort"
import type { V2ServerContext, V2ToolInfo } from "@session-manager/infrastructure/host/V2ServerContext"
import type { V2Client } from "@session-manager/infrastructure/host/V2Client"
import type { HostColor, V2AppClaim, V2KeymapLayer, V2SidebarClaim, V2SlotClaim, V2TuiContext } from "@session-manager/infrastructure/host/V2TuiContext"

/** Records every tool added through `tool.transform`, like the v2.0.14 ToolEditor. */
export function fakeServerContext(): V2ServerContext & { readonly added: V2ToolInfo[]; transforms: number } {
  const added: V2ToolInfo[] = []
  const context = {
    added,
    transforms: 0,
    tool: {
      async transform(callback: (editor: { add(tool: V2ToolInfo): void }) => void) {
        context.transforms++
        callback({ add: (tool) => added.push(tool) })
        return { dispose: () => undefined }
      },
    },
  }
  return context
}

export type RecordedClaim = V2SidebarClaim

/** A v2 client that knows no sessions or projects and records moves. */
export function fakeV2Client(): V2Client & { moves: Array<{ sessionID: string; directory: string }> } {
  const moves: Array<{ sessionID: string; directory: string }> = []
  return {
    moves,
    session: {
      list: async () => ({ data: [] }),
      move: async (input) => void moves.push({ ...input }),
    },
    project: { list: async () => [] },
  }
}

/**
 * Records slot claims and their disposals, like the v2.0.14 `ui.slot`: sidebar
 * claims in `claims`, app claims in `appClaims`, every disposal in `disposed`.
 * The dialog member answers "nothing" unless a test needs more.
 * `route` and `sessions` stand for the host's router and its synced session
 * data; tests change them to open another session or rename one.
 * `subscriptions` stands for the host's `data.on` event table (the reconnect
 * guard reads `server.connected` / `session.deleted` from it); `emit` fires
 * the active handlers. `sync` stands for `data.session.sync` (tests replace
 * the implementation to script resolve/reject per call); `navigations` and
 * `toasts` record `ui.router.navigate` / `ui.toast.show`.
 */
export type FakeTuiEvent = "server.connected" | "session.deleted"

export interface FakeTuiSubscription {
  event: FakeTuiEvent
  handler: (...args: string[]) => void
  active: boolean
}

export interface FakeTuiRoute {
  readonly type: string
  readonly sessionID?: string
}

export interface FakeTuiToast {
  readonly title?: string
  readonly message: string
  readonly variant?: "info" | "success" | "warning" | "error"
  readonly duration?: number
}

export function fakeTuiContext(muted: HostColor = "#808080") {
  const claims: RecordedClaim[] = []
  const appClaims: V2AppClaim[] = []
  const disposed: V2SlotClaim[] = []
  const layers: Array<() => V2KeymapLayer> = []
  const sessions = new Map<string, SessionLink>()
  const subscriptions: FakeTuiSubscription[] = []
  const navigations: FakeTuiRoute[] = []
  const toasts: FakeTuiToast[] = []
  let syncImpl: (sessionID: string) => Promise<void> = async () => undefined
  const theme = { text: { muted } }
  const context: V2TuiContext & {
    claims: RecordedClaim[]
    appClaims: V2AppClaim[]
    disposed: V2SlotClaim[]
    layers: Array<() => V2KeymapLayer>
    theme: typeof theme
    sessions: Map<string, SessionLink>
    route: { type: string; sessionID?: string }
    subscriptions: FakeTuiSubscription[]
    navigations: FakeTuiRoute[]
    toasts: FakeTuiToast[]
    emit(event: FakeTuiEvent, ...args: string[]): void
    data: {
      session: {
        get(sessionID: string): SessionLink | undefined
        sync(sessionID: string, options?: { readonly children?: boolean }): Promise<void>
      }
      on(event: FakeTuiEvent, handler: (...args: string[]) => void): () => void
    }
    ui: {
      slot(claim: V2SlotClaim): () => void
      dialog: V2TuiContext["ui"]["dialog"]
      toast: { show(toast: FakeTuiToast): void }
      router: { current(): FakeTuiRoute; navigate(route: FakeTuiRoute): void }
    }
  } = {
    claims,
    appClaims,
    disposed,
    layers,
    theme,
    sessions,
    route: { type: "home" },
    subscriptions,
    navigations,
    toasts,
    emit: (event, ...args) => {
      for (const subscription of subscriptions) {
        if (subscription.active && subscription.event === event) subscription.handler(...args)
      }
    },
    client: fakeV2Client(),
    data: {
      session: {
        get: (sessionID) => sessions.get(sessionID),
        sync: (sessionID, _options) => syncImpl(sessionID),
      },
      on: (event, handler) => {
        const subscription: FakeTuiSubscription = { event, handler, active: true }
        subscriptions.push(subscription)
        return () => {
          subscription.active = false
        }
      },
    },
    keymap: { layer: (layer) => void layers.push(layer) },
    ui: {
      slot(claim) {
        if ("prepend" in claim) claims.push(claim)
        else appClaims.push(claim)
        return () => {
          disposed.push(claim)
        }
      },
      dialog: { show: () => undefined, set: () => undefined, clear: () => undefined, select: async () => undefined },
      toast: { show: (toast) => void toasts.push(toast) },
      router: {
        current: () => context.route,
        navigate: (route) => void navigations.push(route),
      },
    },
  }
  return context
}

/** Outbound stand-in: one fixed colour, counting reads so laziness is observable. */
export function fakePalette(color: string) {
  const palette = {
    reads: 0,
    color,
    muted(): string {
      palette.reads++
      return palette.color
    },
  }
  return palette satisfies ThemePalettePort<string> & { reads: number; color: string }
}

/** Outbound stand-in: keeps the entry instead of rendering it, so laziness is observable. */
export function fakeView() {
  const entries: SidebarEntry<string>[] = []
  const view = {
    entries,
    render(entry: SidebarEntry<string>): SidebarEntry<string> {
      entries.push(entry)
      return entry
    },
  }
  return view satisfies SidebarViewPort<string, SidebarEntry<string>>
}

/** Inbound stand-in for the sidebar renderer, recording what the host asked for. */
export function fakeRenderer() {
  const inputs: SidebarSlotInput[] = []
  const renderer = {
    inputs,
    render(input: SidebarSlotInput): string {
      inputs.push(input)
      return `rendered:${input.sessionID}`
    },
  }
  return renderer satisfies RenderSidebarEntryPort<string> & { inputs: SidebarSlotInput[] }
}
