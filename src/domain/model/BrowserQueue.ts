import { activeList, idsOf, paneOf, selectedRow, sessionsById } from "@session-manager/domain/model/BrowserRows"
import type { BrowserState, Direction, PlannedSync, QueueEntry } from "@session-manager/domain/model/BrowserState"
import type { CatalogedSession } from "@session-manager/domain/model/SessionCatalog"
import type { Prefer } from "@session-manager/domain/model/SessionSync"

/**
 * The action queue: whole-session syncs to the other side — the OpenCode session with its sub-agent
 * sessions and its Magic Context state. A sub-agent session queues its root (a conversation is never
 * synced in halves). What each sync does follows from how the two histories relate, which the dry run
 * (`d`) works out and shows per entry.
 */
const NEXT_PREFER: Readonly<Record<Prefer, Prefer>> = { further: "keep", keep: "replace", replace: "further" }

/** The root session of `id` in a catalog: up the parent links while the parent is there. */
function rootOf(sessions: ReadonlyMap<string, CatalogedSession>, id: string): string {
  const seen = new Set<string>([id])
  let current = id
  let parent = sessions.get(current)?.parentId ?? null
  while (parent !== null && sessions.has(parent) && !seen.has(parent)) {
    seen.add(parent)
    current = parent
    parent = sessions.get(current)?.parentId ?? null
  }
  return current
}

export function enqueue(state: BrowserState, direction: Direction): BrowserState {
  if (state.right === null) return { ...state, notice: "Open a second profile with --right to sync between sides." }
  const ids = state.marked.length > 0 ? state.marked : idsOf(state, activeList(state), selectedRow(state))
  if (ids.length === 0) return { ...state, notice: "Nothing selected." }
  const [fromSide, toSide] = direction === "to-right" ? (["left", "right"] as const) : (["right", "left"] as const)
  const from = sessionsById(paneOf(state, fromSide)!.catalog.sessions)
  const to = sessionsById(paneOf(state, toSide)!.catalog.sessions)
  let missing = 0
  const roots: string[] = []
  for (const id of ids) {
    if (!from.has(id)) missing++
    else if (!roots.includes(rootOf(from, id))) roots.push(rootOf(from, id))
  }
  let queue = [...state.queue]
  for (const id of roots) {
    const source = from.get(id)!
    const entry: QueueEntry = { id, title: source.title, direction, source, target: to.get(id) ?? null, prefer: "further", planned: null }
    queue = [...queue.filter((existing) => existing.id !== id), entry]
  }
  const arrow = direction === "to-right" ? "→" : "←"
  const skipped = missing === 0 ? "" : `; skipped ${missing} not on the ${fromSide}`
  const notice = `Queued ${roots.length} session ${roots.length === 1 ? "sync" : "syncs"} ${arrow}${skipped}. Q shows the queue; d checks it on copies.`
  return { ...state, queue, marked: [], notice }
}

/** Cycles whose Magic Context state wins (further → keep → replace) for the entry under the cursor, or sets every entry to its next value. */
export function cyclePrefer(state: BrowserState, all: boolean): BrowserState {
  const current = state.queue[state.queueCursor]
  if (current === undefined) return state
  const next = NEXT_PREFER[current.prefer]
  const queue = state.queue.map((entry) => (all || entry === current ? { ...entry, prefer: next, planned: null } : entry))
  return { ...state, queue }
}

/** Whole Magic Context state (sessions and their projects) or the sessions' own state only. */
export function toggleScope(state: BrowserState): BrowserState {
  return { ...state, scope: state.scope === "all" ? "sessions" : "all", queue: state.queue.map((entry) => ({ ...entry, planned: null })) }
}

export function unqueue(state: BrowserState): BrowserState {
  const queue = state.queue.filter((_, index) => index !== state.queueCursor)
  return { ...state, queue, queueCursor: clampQueue(state.queueCursor, queue.length) }
}

export function moveInQueue(state: BrowserState, delta: number): BrowserState {
  return { ...state, queueCursor: clampQueue(state.queueCursor + delta, state.queue.length) }
}

/** The first queue entry a window of `height` rows shows, keeping the cursor in view. */
export function queueWindowStart(state: BrowserState): number {
  return Math.max(0, state.queueCursor - state.listHeight + 1)
}

export interface QueueSummary {
  readonly entries: number
  /** Entries the target does not have yet. */
  readonly new: number
  /** Entries a dry run found diverged (skipped). */
  readonly diverged: number
}

export function queueSummary(queue: readonly QueueEntry[]): QueueSummary {
  return {
    entries: queue.length,
    new: queue.filter((entry) => entry.target === null).length,
    diverged: queue.filter((entry) => entry.planned?.reason === "diverged").length,
  }
}

function clampQueue(cursor: number, length: number): number {
  return Math.min(Math.max(0, cursor), Math.max(0, length - 1))
}

/** The sessions queued in one direction, with the entries whose preference differs from `further`. */
export function requestsFor(queue: readonly QueueEntry[], direction: Direction): { readonly ids: string[]; readonly preferFor: Record<string, Prefer> } {
  const entries = queue.filter((entry) => entry.direction === direction)
  return { ids: entries.map((entry) => entry.id), preferFor: Object.fromEntries(entries.filter((entry) => entry.prefer !== "further").map((entry) => [entry.id, entry.prefer])) }
}

/** The queue with each entry's result from a run. */
export function withPlans(queue: readonly QueueEntry[], planned: Readonly<Record<string, PlannedSync>>): QueueEntry[] {
  return queue.map((entry) => (Object.hasOwn(planned, entry.id) ? { ...entry, planned: planned[entry.id]! } : entry))
}
