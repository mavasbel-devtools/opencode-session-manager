import type { SidebarEntry } from "@session-id/domain/model/SidebarEntry"
import type { RenderSidebarEntryPort, SidebarSlotInput } from "@session-id/domain/ports/inbound/RenderSidebarEntryPort"
import type { SidebarViewPort } from "@session-id/domain/ports/outbound/SidebarViewPort"
import type { ThemePalettePort } from "@session-id/domain/ports/outbound/ThemePalettePort"
import type { V2ServerContext, V2ToolInfo } from "@session-id/infrastructure/host/V2ServerContext"
import type { HostColor, V2SidebarClaim, V2TuiContext } from "@session-id/infrastructure/host/V2TuiContext"

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

/** Records slot claims and their disposals, like the v2.0.14 `ui.slot`. */
export function fakeTuiContext(muted: HostColor = "#808080") {
  const claims: RecordedClaim[] = []
  const disposed: RecordedClaim[] = []
  const theme = { text: { muted } }
  const context: V2TuiContext & { claims: RecordedClaim[]; disposed: RecordedClaim[]; theme: typeof theme } = {
    claims,
    disposed,
    theme,
    ui: {
      slot(claim) {
        claims.push(claim)
        return () => {
          disposed.push(claim)
        }
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
