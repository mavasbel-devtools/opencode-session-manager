import type { BrowserAction, BrowserState, RebuildRequest } from "@session-manager/domain/model/Browser"

/** The fields of an OpenTUI key event the browser reads. */
export interface KeyInput {
  readonly name: string
  readonly ctrl: boolean
  readonly shift: boolean
  readonly sequence: string
}

export type Command =
  | BrowserAction
  | { readonly type: "quit" }
  | { readonly type: "apply"; readonly dryRun: boolean }
  | { readonly type: "rebuild"; readonly request: RebuildRequest }

const BROWSE: Readonly<Record<string, Command>> = {
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
  space: { type: "mark" },
  tab: { type: "focus" },
  left: { type: "focus", side: "left" },
  h: { type: "focus", side: "left" },
  right: { type: "focus", side: "right" },
  l: { type: "focus", side: "right" },
  p: { type: "layout" },
  "/": { type: "filter-start" },
  slash: { type: "filter-start" },
  escape: { type: "filter-clear" },
  q: { type: "quit" },
}

/** Keys told apart by the character they type rather than by their name. */
const TYPED: Readonly<Record<string, Command>> = {
  "*": { type: "mark-all" },
  ">": { type: "enqueue", direction: "to-right" },
  "<": { type: "enqueue", direction: "to-left" },
  G: { type: "end" },
  Q: { type: "view", view: "queue" },
  W: { type: "rebuild-ask", command: "wrapup" },
  R: { type: "rebuild-ask", command: "recomp" },
}

const QUEUE: Readonly<Record<string, Command>> = {
  up: { type: "queue-move", delta: -1 },
  k: { type: "queue-move", delta: -1 },
  down: { type: "queue-move", delta: 1 },
  j: { type: "queue-move", delta: 1 },
  r: { type: "prefer" },
  t: { type: "scope" },
  x: { type: "unqueue" },
  delete: { type: "unqueue" },
  c: { type: "queue-clear" },
  a: { type: "apply", dryRun: false },
  d: { type: "apply", dryRun: true },
  escape: { type: "view", view: "list" },
  q: { type: "quit" },
}

const QUEUE_TYPED: Readonly<Record<string, Command>> = {
  R: { type: "prefer", all: true },
  Q: { type: "view", view: "list" },
}

/** What a key does: while the filter is being typed, keys edit it; in the queue they edit the queue; otherwise they browse. */
export function commandFor(key: KeyInput, state: BrowserState): Command | null {
  if (key.ctrl && key.name === "c") return { type: "quit" }
  if (state.editingFilter) {
    if (key.name === "return" || key.name === "enter") return { type: "filter-commit" }
    if (key.name === "escape") return { type: "filter-clear" }
    if (key.name === "backspace") return { type: "filter-backspace" }
    return key.sequence.length === 1 && key.sequence >= " " && !key.ctrl ? { type: "filter-input", text: key.sequence } : null
  }
  const [typed, named] = state.view === "queue" ? [QUEUE_TYPED, QUEUE] : [TYPED, BROWSE]
  const command = Object.hasOwn(typed, key.sequence)
    ? typed[key.sequence]!
    : key.shift && Object.hasOwn(typed, key.name.toUpperCase())
      ? typed[key.name.toUpperCase()]!
      : Object.hasOwn(named, key.name)
        ? named[key.name]!
        : null
  // The same rebuild key a second time runs what the first one asked.
  if (command?.type === "rebuild-ask" && state.confirm?.command === command.command) return { type: "rebuild", request: state.confirm }
  return command
}
