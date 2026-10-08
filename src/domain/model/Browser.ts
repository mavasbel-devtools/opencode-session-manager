import type { CatalogedSession, ProfileCatalog } from "@session-manager/domain/model/SessionCatalog"

/**
 * The two-pane session browser as pure state: what each pane lists, where its cursor is, and what
 * the keys and the mouse do to it. The view only paints this state and turns input into actions.
 */
export type Side = "left" | "right"

/** How a session relates to the session with the same id in the other pane. */
export type Match = "only-here" | "same" | "newer-here" | "older-here"

export interface GroupRow {
  readonly kind: "group"
  readonly directory: string
  readonly sessions: number
  readonly collapsed: boolean
}

export interface SessionRow {
  readonly kind: "session"
  readonly session: CatalogedSession
  /** Null when only one pane is open. */
  readonly match: Match | null
}

export type BrowserRow = GroupRow | SessionRow

export interface PaneState {
  readonly catalog: ProfileCatalog
  /** Where the catalog was read from when the profile could not be read in place. */
  readonly snapshot: string | null
  readonly collapsed: readonly string[]
  readonly cursor: number
  readonly offset: number
}

export interface BrowserState {
  readonly left: PaneState
  readonly right: PaneState | null
  readonly focus: Side
  readonly filter: string
  readonly editingFilter: boolean
  /** How many rows a pane's list shows at once. */
  readonly listHeight: number
}

export type BrowserAction =
  | { readonly type: "move"; readonly delta: number }
  | { readonly type: "page"; readonly direction: 1 | -1 }
  | { readonly type: "home" }
  | { readonly type: "end" }
  | { readonly type: "toggle" }
  | { readonly type: "focus"; readonly side?: Side }
  | { readonly type: "select"; readonly side: Side; readonly index: number }
  | { readonly type: "scroll"; readonly side: Side; readonly delta: number }
  | { readonly type: "filter-start" }
  | { readonly type: "filter-input"; readonly text: string }
  | { readonly type: "filter-backspace" }
  | { readonly type: "filter-commit" }
  | { readonly type: "filter-clear" }
  | { readonly type: "resize"; readonly listHeight: number }

export interface OpenedProfile {
  readonly catalog: ProfileCatalog
  readonly snapshot: string | null
}

export function createBrowser(left: OpenedProfile, right: OpenedProfile | null, listHeight: number): BrowserState {
  const pane = (opened: OpenedProfile): PaneState => ({ ...opened, collapsed: [], cursor: 0, offset: 0 })
  return {
    left: pane(left),
    right: right === null ? null : pane(right),
    focus: "left",
    filter: "",
    editingFilter: false,
    listHeight: Math.max(1, listHeight),
  }
}

export function paneOf(state: BrowserState, side: Side): PaneState | null {
  return side === "left" ? state.left : state.right
}

/** A pane's rows: sessions grouped by folder, folders ordered by their newest session, the filter applied. */
export function rowsOf(state: BrowserState, side: Side): BrowserRow[] {
  const pane = paneOf(state, side)
  if (pane === null) return []
  const other = paneOf(state, side === "left" ? "right" : "left")
  const otherTimes = other === null ? null : new Map(other.catalog.sessions.map((session) => [session.id, session.timeUpdated]))
  const needle = state.filter.toLowerCase()
  const groups = new Map<string, CatalogedSession[]>()
  for (const session of pane.catalog.sessions) {
    if (needle !== "" && ![session.id, session.title ?? "", session.directory].some((field) => field.toLowerCase().includes(needle))) continue
    const group = groups.get(session.directory)
    if (group === undefined) groups.set(session.directory, [session])
    else group.push(session)
  }
  const rows: BrowserRow[] = []
  for (const [directory, sessions] of groups) {
    const collapsed = pane.collapsed.includes(directory)
    rows.push({ kind: "group", directory, sessions: sessions.length, collapsed })
    if (collapsed) continue
    for (const session of sessions) rows.push({ kind: "session", session, match: matchOf(session, otherTimes) })
  }
  return rows
}

function matchOf(session: CatalogedSession, otherTimes: ReadonlyMap<string, number> | null): Match | null {
  if (otherTimes === null) return null
  const other = otherTimes.get(session.id)
  if (other === undefined) return "only-here"
  if (other === session.timeUpdated) return "same"
  return session.timeUpdated > other ? "newer-here" : "older-here"
}

export function selectedRow(state: BrowserState, side: Side): BrowserRow | undefined {
  const pane = paneOf(state, side)
  return pane === null ? undefined : rowsOf(state, side)[pane.cursor]
}

export function reduce(state: BrowserState, action: BrowserAction): BrowserState {
  switch (action.type) {
    case "move":
      return withPane(state, state.focus, (pane) => ({ ...pane, cursor: pane.cursor + action.delta }))
    case "page":
      return withPane(state, state.focus, (pane) => ({ ...pane, cursor: pane.cursor + action.direction * state.listHeight }))
    case "home":
      return withPane(state, state.focus, (pane) => ({ ...pane, cursor: 0 }))
    case "end":
      return withPane(state, state.focus, (pane) => ({ ...pane, cursor: Number.MAX_SAFE_INTEGER }))
    case "toggle":
      return toggle(state)
    case "focus": {
      const side = action.side ?? (state.focus === "left" ? "right" : "left")
      return paneOf(state, side) === null ? state : { ...state, focus: side }
    }
    case "select":
      if (paneOf(state, action.side) === null) return state
      return withPane({ ...state, focus: action.side }, action.side, (pane) => ({ ...pane, cursor: pane.offset + action.index }))
    case "scroll":
      return withPane(state, action.side, (pane) => ({ ...pane, offset: pane.offset + action.delta }), true)
    case "filter-start":
      return { ...state, editingFilter: true }
    case "filter-input":
      return refilter(state, state.filter + action.text)
    case "filter-backspace":
      return refilter(state, state.filter.slice(0, -1))
    case "filter-commit":
      return { ...state, editingFilter: false }
    case "filter-clear":
      return { ...refilter(state, ""), editingFilter: false }
    case "resize":
      return clampAll({ ...state, listHeight: Math.max(1, action.listHeight) })
  }
}

/** Collapses or expands the folder under the cursor; on a session, collapses its folder and selects it. */
function toggle(state: BrowserState): BrowserState {
  const row = selectedRow(state, state.focus)
  if (row === undefined) return state
  const directory = row.kind === "group" ? row.directory : row.session.directory
  return withPane(state, state.focus, (pane) => {
    const collapsed = pane.collapsed.includes(directory)
      ? pane.collapsed.filter((entry) => entry !== directory)
      : [...pane.collapsed, directory]
    const next = { ...pane, collapsed }
    const groupIndex = rowsOf(replacePane(state, state.focus, next), state.focus).findIndex(
      (entry) => entry.kind === "group" && entry.directory === directory,
    )
    return { ...next, cursor: groupIndex }
  })
}

function refilter(state: BrowserState, filter: string): BrowserState {
  const reset = (pane: PaneState | null) => (pane === null ? null : { ...pane, cursor: 0, offset: 0 })
  return clampAll({ ...state, filter, left: reset(state.left)!, right: reset(state.right) })
}

function clampAll(state: BrowserState): BrowserState {
  const left = clamp(state, "left", state.left, false)
  const withLeft = { ...state, left }
  return state.right === null ? withLeft : { ...withLeft, right: clamp(withLeft, "right", state.right, false) }
}

function withPane(state: BrowserState, side: Side, change: (pane: PaneState) => PaneState, scrolling = false): BrowserState {
  const pane = paneOf(state, side)
  if (pane === null) return state
  const changed = change(pane)
  return replacePane(state, side, clamp(replacePane(state, side, changed), side, changed, scrolling))
}

function replacePane(state: BrowserState, side: Side, pane: PaneState): BrowserState {
  return side === "left" ? { ...state, left: pane } : { ...state, right: pane }
}

/**
 * Keeps the cursor on a row and the list window over the rows. Moving the cursor scrolls the window
 * to it; scrolling the window (the mouse wheel) drags the cursor into it.
 */
function clamp(state: BrowserState, side: Side, pane: PaneState, scrolling: boolean): PaneState {
  const count = rowsOf(replacePane(state, side, pane), side).length
  const height = state.listHeight
  const last = Math.max(0, count - 1)
  let offset = Math.min(Math.max(0, pane.offset), Math.max(0, count - height))
  let cursor = Math.min(Math.max(0, pane.cursor), last)
  if (scrolling) cursor = Math.min(Math.max(cursor, offset), offset + height - 1, last)
  else if (cursor < offset) offset = cursor
  else if (cursor >= offset + height) offset = cursor - height + 1
  return { ...pane, cursor, offset }
}
