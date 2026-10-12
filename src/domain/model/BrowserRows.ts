import type {
  BrowserRow,
  BrowserState,
  ListId,
  ListPosition,
  Match,
  PairMatch,
  PaneState,
  Side,
} from "@session-manager/domain/model/BrowserState"
import type { CatalogedSession } from "@session-manager/domain/model/SessionCatalog"

/** One entry of a list before it is laid out: a session of one pane, or one id across both. */
interface Item {
  readonly id: string
  readonly directory: string
  readonly row: (marked: boolean) => BrowserRow
  readonly matches: (test: (session: CatalogedSession | null) => boolean) => boolean
}

export function paneOf(state: BrowserState, side: Side): PaneState | null {
  return side === "left" ? state.left : state.right
}

/** The list the keys act on: the paired list, or the focused pane. */
export function activeList(state: BrowserState): ListId {
  return state.layout === "paired" ? "paired" : state.focus
}

export function positionOf(state: BrowserState, list: ListId): ListPosition | null {
  return list === "paired" ? (state.right === null ? null : state.paired) : paneOf(state, list)
}

export function withPosition(state: BrowserState, list: ListId, position: ListPosition): BrowserState {
  if (list === "paired") return { ...state, paired: position }
  if (list === "left") return { ...state, left: { ...state.left, ...position } }
  return { ...state, right: { ...state.right!, ...position } }
}

/** A list's items grouped by folder, folders ordered by their newest item, the filter applied. */
export function groupsOf(state: BrowserState, list: ListId): Map<string, Item[]> {
  const needle = state.filter.toLowerCase()
  const matches = (session: CatalogedSession | null) =>
    session !== null && [session.id, session.title ?? "", session.directory].some((field) => field.toLowerCase().includes(needle))
  const groups = new Map<string, Item[]>()
  for (const item of itemsOf(state, list)) {
    if (needle !== "" && !item.matches(matches)) continue
    const group = groups.get(item.directory)
    if (group === undefined) groups.set(item.directory, [item])
    else group.push(item)
  }
  return groups
}

/** A list's rows: each folder, then its items unless the folder is collapsed. */
export function rowsOf(state: BrowserState, list: ListId): BrowserRow[] {
  const position = positionOf(state, list)
  if (position === null) return []
  const marked = new Set(state.marked)
  const rows: BrowserRow[] = []
  for (const [directory, items] of groupsOf(state, list)) {
    const collapsed = position.collapsed.includes(directory)
    rows.push({ kind: "group", directory, sessions: items.length, collapsed, marked: items.filter((item) => marked.has(item.id)).length })
    if (!collapsed) for (const item of items) rows.push(item.row(marked.has(item.id)))
  }
  return rows
}

/** Every session id a list shows under the filter, collapsed folders included. */
export function visibleIds(state: BrowserState, list: ListId): string[] {
  return [...groupsOf(state, list).values()].flat().map((item) => item.id)
}

/** The session ids a row stands for: its own, or every one in its folder. */
export function idsOf(state: BrowserState, list: ListId, row: BrowserRow | undefined): string[] {
  if (row === undefined) return []
  if (row.kind === "session") return [row.session.id]
  if (row.kind === "pair") return [row.id]
  return (groupsOf(state, list).get(row.directory) ?? []).map((item) => item.id)
}

export function selectedRow(state: BrowserState, list: ListId = activeList(state)): BrowserRow | undefined {
  const position = positionOf(state, list)
  return position === null ? undefined : rowsOf(state, list)[position.cursor]
}

/** The session id under a list's cursor, if the cursor is on a session. */
export function selectedId(state: BrowserState, list: ListId): string | null {
  const row = selectedRow(state, list)
  if (row === undefined || row.kind === "group") return null
  return row.kind === "pair" ? row.id : row.session.id
}

export function indexOfId(state: BrowserState, list: ListId, id: string): number {
  return rowsOf(state, list).findIndex((row) => (row.kind === "pair" ? row.id : row.kind === "session" ? row.session.id : null) === id)
}

/**
 * One session per id: its OpenCode 2 row, or its OpenCode 1 row when it has no other (a session
 * moved to OpenCode 2 keeps its OpenCode 1 row beside the new one), in the catalog's order.
 */
export function sessionsById(sessions: readonly CatalogedSession[]): Map<string, CatalogedSession> {
  const map = new Map<string, CatalogedSession>()
  for (const session of sessions) if (session.generation === "v2" || !map.has(session.id)) map.set(session.id, session)
  return map
}

function itemsOf(state: BrowserState, list: ListId): Item[] {
  if (list !== "paired") {
    const pane = paneOf(state, list)!
    const other = paneOf(state, list === "left" ? "right" : "left")
    const otherTimes = other === null ? null : new Map([...sessionsById(other.catalog.sessions)].map(([id, session]) => [id, session.timeUpdated]))
    return pane.catalog.sessions.map((session) => ({
      id: session.id,
      directory: session.directory,
      matches: (test) => test(session),
      row: (marked) => ({ kind: "session", session, match: matchOf(session, otherTimes), marked }),
    }))
  }
  const right = sessionsById(state.right!.catalog.sessions)
  const pairs: Array<{ id: string; left: CatalogedSession | null; right: CatalogedSession | null }> = [...sessionsById(state.left.catalog.sessions).values()].map(
    (session) => ({ id: session.id, left: session, right: right.get(session.id) ?? null }),
  )
  const onLeft = new Set(pairs.map((pair) => pair.id))
  for (const session of right.values()) if (!onLeft.has(session.id)) pairs.push({ id: session.id, left: null, right: session })
  const newest = (pair: (typeof pairs)[number]) => Math.max(pair.left?.timeUpdated ?? 0, pair.right?.timeUpdated ?? 0)
  return pairs
    .sort((a, b) => newest(b) - newest(a) || a.id.localeCompare(b.id))
    .map((pair) => ({
      id: pair.id,
      directory: (pair.left ?? pair.right)!.directory,
      matches: (test) => test(pair.left) || test(pair.right),
      row: (marked) => ({ kind: "pair", id: pair.id, left: pair.left, right: pair.right, match: pairMatchOf(pair.left, pair.right), marked }),
    }))
}

function matchOf(session: CatalogedSession, otherTimes: ReadonlyMap<string, number> | null): Match | null {
  if (otherTimes === null) return null
  const other = otherTimes.get(session.id)
  if (other === undefined) return "only-here"
  if (other === session.timeUpdated) return "same"
  return session.timeUpdated > other ? "newer-here" : "older-here"
}

function pairMatchOf(left: CatalogedSession | null, right: CatalogedSession | null): PairMatch {
  if (right === null) return "left-only"
  if (left === null) return "right-only"
  if (left.timeUpdated === right.timeUpdated) return "same"
  return left.timeUpdated > right.timeUpdated ? "left-newer" : "right-newer"
}
