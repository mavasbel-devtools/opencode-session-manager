import { activeList, idsOf, paneOf, selectedRow } from "@session-manager/domain/model/BrowserRows"
import type { BrowserState, Direction, QueueEntry, Resolution } from "@session-manager/domain/model/BrowserState"

/**
 * The action queue: copies of one session's Magic Context state to the other side. A copy needs the
 * session on both sides (Magic Context state points at the session's messages) and state to copy;
 * when the target has state of its own, the entry is a conflict until it is resolved.
 */
export function enqueue(state: BrowserState, direction: Direction): BrowserState {
  if (state.right === null) return { ...state, notice: "Open a second profile with --right to copy between sides." }
  const ids = state.marked.length > 0 ? state.marked : idsOf(state, activeList(state), selectedRow(state))
  if (ids.length === 0) return { ...state, notice: "Nothing selected." }
  const [fromSide, toSide] = direction === "to-right" ? (["left", "right"] as const) : (["right", "left"] as const)
  const from = new Map(paneOf(state, fromSide)!.catalog.sessions.map((session) => [session.id, session]))
  const to = new Map(paneOf(state, toSide)!.catalog.sessions.map((session) => [session.id, session]))
  const skipped = { source: 0, target: 0, empty: 0 }
  let queue = [...state.queue]
  let queued = 0
  for (const id of ids) {
    const source = from.get(id)
    const target = to.get(id)
    if (source === undefined) skipped.source++
    else if (target === undefined) skipped.target++
    else if (source.magicContext === null) skipped.empty++
    else {
      const conflict = target.magicContext !== null
      const entry: QueueEntry = { id, title: source.title, direction, source: source.magicContext, conflict, resolution: conflict ? null : "replace" }
      queue = [...queue.filter((existing) => existing.id !== id), entry]
      queued++
    }
  }
  const reasons = [
    skipped.source === 0 ? null : `${skipped.source} not on the ${fromSide}`,
    skipped.target === 0 ? null : `${skipped.target} not on the ${toSide} (sync the session first)`,
    skipped.empty === 0 ? null : `${skipped.empty} with no Magic Context state`,
  ].filter((reason) => reason !== null)
  const arrow = direction === "to-right" ? "→" : "←"
  const notice = `Queued ${queued} Magic Context ${queued === 1 ? "copy" : "copies"} ${arrow}${reasons.length === 0 ? "" : `; skipped ${reasons.join(", ")}`}.`
  return { ...state, queue, marked: [], notice }
}

export function resolve(state: BrowserState, resolution: Resolution, all: boolean): BrowserState {
  const current = state.queue[state.queueCursor]
  if (current === undefined) return state
  if (!all && !current.conflict) return { ...state, notice: "No conflict: the target has no Magic Context state for this session." }
  const queue = state.queue.map((entry) => (entry.conflict && (all || entry === current) ? { ...entry, resolution } : entry))
  return { ...state, queue }
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

export function queueSummary(queue: readonly QueueEntry[]): { readonly entries: number; readonly conflicts: number; readonly undecided: number } {
  return {
    entries: queue.length,
    conflicts: queue.filter((entry) => entry.conflict).length,
    undecided: queue.filter((entry) => entry.resolution === null).length,
  }
}

function clampQueue(cursor: number, length: number): number {
  return Math.min(Math.max(0, cursor), Math.max(0, length - 1))
}
