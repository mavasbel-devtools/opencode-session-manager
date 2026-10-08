import type { BrowserAction, BrowserState } from "@session-manager/domain/model/Browser"

/** The fields of an OpenTUI key event the browser reads. */
export interface KeyInput {
  readonly name: string
  readonly ctrl: boolean
  readonly shift: boolean
  readonly sequence: string
}

export type Command = BrowserAction | { readonly type: "quit" }

const BROWSE: Readonly<Record<string, BrowserAction | { readonly type: "quit" }>> = {
  up: { type: "move", delta: -1 },
  k: { type: "move", delta: -1 },
  down: { type: "move", delta: 1 },
  j: { type: "move", delta: 1 },
  pageup: { type: "page", direction: -1 },
  pagedown: { type: "page", direction: 1 },
  home: { type: "home" },
  g: { type: "home" },
  end: { type: "end" },
  return: { type: "toggle" },
  enter: { type: "toggle" },
  space: { type: "toggle" },
  tab: { type: "focus" },
  left: { type: "focus", side: "left" },
  h: { type: "focus", side: "left" },
  right: { type: "focus", side: "right" },
  l: { type: "focus", side: "right" },
  "/": { type: "filter-start" },
  slash: { type: "filter-start" },
  escape: { type: "filter-clear" },
  q: { type: "quit" },
}

/** What a key does: while the filter is being typed, keys edit it; otherwise they browse. */
export function commandFor(key: KeyInput, state: BrowserState): Command | null {
  if (key.ctrl && key.name === "c") return { type: "quit" }
  if (state.editingFilter) {
    if (key.name === "return" || key.name === "enter") return { type: "filter-commit" }
    if (key.name === "escape") return { type: "filter-clear" }
    if (key.name === "backspace") return { type: "filter-backspace" }
    return key.sequence.length === 1 && key.sequence >= " " && !key.ctrl ? { type: "filter-input", text: key.sequence } : null
  }
  if (key.shift && key.name === "g") return { type: "end" }
  return Object.hasOwn(BROWSE, key.name) ? BROWSE[key.name]! : null
}
