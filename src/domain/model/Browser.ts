import { cyclePrefer, enqueue, moveInQueue, toggleDiverged, toggleScope, unqueue, withPlans } from "@session-manager/domain/model/BrowserQueue"
import {
  activeList,
  idsOf,
  indexOfId,
  positionOf,
  rowsOf,
  selectedId,
  selectedRow,
  visibleIds,
  withPosition,
} from "@session-manager/domain/model/BrowserRows"
import type { BrowserAction, BrowserState, ListId, ListPosition, MagicContextReleaseState, OpenedProfile, Side } from "@session-manager/domain/model/BrowserState"
import type { LiveCommand } from "@session-manager/domain/model/BrowserState"

export * from "@session-manager/domain/model/BrowserState"
export { activeList, paneOf, rowsOf, selectedRow } from "@session-manager/domain/model/BrowserRows"
export { queueSummary, queueWindowStart, requestsFor } from "@session-manager/domain/model/BrowserQueue"

/**
 * The two-pane session browser as pure state: what each list shows, where its cursor is, what is
 * marked and queued, and what the keys and the mouse do to it. The view only paints this state
 * and turns input into actions.
 */
const START: ListPosition = { collapsed: [], cursor: 0, offset: 0 }

export function createBrowser(left: OpenedProfile, right: OpenedProfile | null, listHeight: number, release: MagicContextReleaseState | null = null): BrowserState {
  return {
    left: { ...left, ...START },
    right: right === null ? null : { ...right, ...START },
    paired: START,
    layout: "panes",
    focus: "left",
    filter: "",
    editingFilter: false,
    listHeight: Math.max(1, listHeight),
    marked: [],
    queue: [],
    scope: "all",
    view: "list",
    queueCursor: 0,
    notice: null,
    lastResult: null,
    release,
    confirm: null,
  }
}

/** Actions that arrive on their own (a terminal resize, npm's answer) and leave the user's notice alone. */
const BACKGROUND: ReadonlySet<BrowserAction["type"]> = new Set(["resize", "release"])

/** Applies one action; the notice of the previous user action is cleared first. */
export function reduce(state: BrowserState, action: BrowserAction): BrowserState {
  return step(BACKGROUND.has(action.type) ? state : { ...state, notice: null, confirm: null }, action)
}

function step(state: BrowserState, action: BrowserAction): BrowserState {
  const list = activeList(state)
  switch (action.type) {
    case "move":
      return linked(moveTo(state, list, (position) => position.cursor + action.delta), list)
    case "page":
      return linked(moveTo(state, list, (position) => position.cursor + action.direction * state.listHeight), list)
    case "home":
      return linked(moveTo(state, list, () => 0), list)
    case "end":
      return linked(moveTo(state, list, () => Number.MAX_SAFE_INTEGER), list)
    case "toggle":
      return linked(fold(state, list), list)
    case "focus": {
      const side = action.side ?? (state.focus === "left" ? "right" : "left")
      return side === "right" && state.right === null ? state : { ...state, focus: side }
    }
    case "select": {
      if (positionOf(state, action.list) === null) return state
      const focused = action.list === "paired" ? state : { ...state, focus: action.list }
      return linked(moveTo(focused, action.list, (position) => position.offset + action.index), action.list)
    }
    case "scroll":
      return positionOf(state, action.list) === null
        ? state
        : linked(update(state, action.list, (position) => ({ ...position, offset: position.offset + action.delta }), true), action.list)
    case "layout":
      return switchLayout(state)
    case "mark":
      return toggleMarks(state, idsOf(state, list, selectedRow(state, list)))
    case "mark-all":
      return toggleMarks(state, visibleIds(state, list))
    case "enqueue":
      return enqueue(state, action.direction)
    case "view":
      return { ...state, view: action.view ?? (state.view === "list" ? "queue" : "list") }
    case "queue-move":
      return moveInQueue(state, action.delta)
    case "prefer":
      return cyclePrefer(state, action.all === true)
    case "diverged":
      return toggleDiverged(state, action.all === true)
    case "scope":
      return toggleScope(state)
    case "unqueue":
      return unqueue(state)
    case "queue-clear":
      return { ...state, queue: [], queueCursor: 0 }
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
    case "notice":
      return { ...state, notice: action.text }
    case "release":
      return { ...state, release: action.release }
    case "rebuild-ask":
      return askRebuild(state, action.command)
    case "applied":
      return applied(state, action)
  }
}

/** The first press of W or R: what would run, on which sessions of the focused side; the same key again runs it. */
function askRebuild(state: BrowserState, command: LiveCommand): BrowserState {
  const ids = state.marked.length > 0 ? state.marked : idsOf(state, activeList(state), selectedRow(state))
  const side = state.focus
  const pane = side === "left" ? state.left : state.right!
  const here = new Set(pane.catalog.sessions.map((session) => session.id))
  const present = ids.filter((id) => here.has(id))
  if (present.length === 0) return { ...state, notice: `Nothing selected on the ${side}.` }
  const count = `${present.length} ${present.length === 1 ? "session" : "sessions"} of the ${side}`
  const notice =
    command === "fork"
      ? `F again: fork ${count} through the running OpenCode; Magic Context gives each fork its parent's state on its first prompt. Any other key cancels.`
      : `${command === "wrapup" ? "W" : "R"} again: ${command === "wrapup" ? "/ctx-wrapup (summarise what lags)" : "/ctx-recomp (rebuild every summary)"} on ${count}, through the running OpenCode; it spends historian tokens. Any other key cancels.`
  return { ...state, confirm: { command, side, ids: present }, notice }
}

/** The result of an apply: sides read again replace the ones shown, and a change empties the queue. */
function applied(state: BrowserState, action: Extract<BrowserAction, { type: "applied" }>): BrowserState {
  const left = action.left === undefined ? state.left : { ...state.left, ...action.left }
  const right = action.right === undefined || state.right === null ? state.right : { ...state.right, ...action.right }
  const queue = action.changed ? [] : withPlans(state.queue, action.planned ?? {})
  return clampAll({ ...state, left, right, queue, queueCursor: action.changed ? 0 : state.queueCursor, lastResult: action.result, notice: action.result[0]! })
}

/** Collapses or expands the folder under the cursor; on a session, collapses its folder and selects it. */
function fold(state: BrowserState, list: ListId): BrowserState {
  const row = selectedRow(state, list)
  if (row === undefined) return state
  const directory = row.kind === "group" ? row.directory : row.kind === "pair" ? (row.left ?? row.right)!.directory : row.session.directory
  const position = positionOf(state, list)!
  const collapsed = position.collapsed.includes(directory)
    ? position.collapsed.filter((entry) => entry !== directory)
    : [...position.collapsed, directory]
  const folded = withPosition(state, list, { ...position, collapsed })
  const cursor = rowsOf(folded, list).findIndex((entry) => entry.kind === "group" && entry.directory === directory)
  return update(folded, list, (current) => ({ ...current, cursor }))
}

/** Panes ↔ paired list, keeping the session under the cursor selected. */
function switchLayout(state: BrowserState): BrowserState {
  if (state.right === null) return { ...state, notice: "Open a second profile with --right to pair sessions." }
  const from = activeList(state)
  const id = selectedId(state, from)
  const switched: BrowserState = { ...state, layout: state.layout === "panes" ? "paired" : "panes" }
  const to = activeList(switched)
  const index = id === null ? -1 : indexOfId(switched, to, id)
  return index === -1 ? switched : linked(update(switched, to, (position) => ({ ...position, cursor: index })), to)
}

/** Marks every id, or unmarks them all when every one is already marked. */
function toggleMarks(state: BrowserState, ids: readonly string[]): BrowserState {
  if (ids.length === 0) return state
  const marked = new Set(state.marked)
  const every = ids.every((id) => marked.has(id))
  for (const id of ids) if (every) marked.delete(id)
  else marked.add(id)
  return { ...state, marked: [...marked] }
}

/** With two panes side by side, the other pane follows to the same session when it lists it. */
function linked(state: BrowserState, from: ListId): BrowserState {
  if (from === "paired" || state.right === null) return state
  const id = selectedId(state, from)
  const other: Side = from === "left" ? "right" : "left"
  const index = id === null ? -1 : indexOfId(state, other, id)
  return index === -1 ? state : update(state, other, (position) => ({ ...position, cursor: index }))
}

function refilter(state: BrowserState, filter: string): BrowserState {
  const top = { cursor: 0, offset: 0 }
  const reset: BrowserState = {
    ...state,
    filter,
    left: { ...state.left, ...top },
    right: state.right === null ? null : { ...state.right, ...top },
    paired: { ...state.paired, ...top },
  }
  return clampAll(reset)
}

function clampAll(state: BrowserState): BrowserState {
  const lists: ListId[] = state.right === null ? ["left"] : ["left", "right", "paired"]
  return lists.reduce((current, list) => update(current, list, (position) => position), state)
}

function moveTo(state: BrowserState, list: ListId, cursor: (position: ListPosition) => number): BrowserState {
  return update(state, list, (position) => ({ ...position, cursor: cursor(position) }))
}

/**
 * Changes a list's position, then keeps the cursor on a row and the window over the rows. Moving
 * the cursor scrolls the window to it; scrolling the window (the mouse wheel) drags the cursor into it.
 */
function update(state: BrowserState, list: ListId, change: (position: ListPosition) => ListPosition, scrolling = false): BrowserState {
  const changed = change(positionOf(state, list)!)
  const count = rowsOf(withPosition(state, list, changed), list).length
  const height = state.listHeight
  const last = Math.max(0, count - 1)
  let offset = Math.min(Math.max(0, changed.offset), Math.max(0, count - height))
  let cursor = Math.min(Math.max(0, changed.cursor), last)
  if (scrolling) cursor = Math.min(Math.max(cursor, offset), offset + height - 1, last)
  else if (cursor < offset) offset = cursor
  else if (cursor >= offset + height) offset = cursor - height + 1
  return withPosition(state, list, { ...changed, cursor, offset })
}
