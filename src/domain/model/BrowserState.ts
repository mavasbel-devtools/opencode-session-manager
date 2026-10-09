import type { CatalogedSession, MagicContextSessionStats, ProfileCatalog } from "@session-manager/domain/model/SessionCatalog"

/**
 * The session browser's state, as plain data: two profiles, how they are laid out, where each
 * list's cursor is, what is marked and what is queued. Reducers live in Browser.ts.
 */
export type Side = "left" | "right"

/** A list the browser shows: one profile's pane, or the paired list of both. */
export type ListId = Side | "paired"

/** How a session relates to the session with the same id in the other pane. */
export type Match = "only-here" | "same" | "newer-here" | "older-here"

/** How the two sides of one session id relate, in the paired list. */
export type PairMatch = "left-only" | "right-only" | "same" | "left-newer" | "right-newer"

export interface GroupRow {
  readonly kind: "group"
  readonly directory: string
  readonly sessions: number
  readonly collapsed: boolean
  /** How many of its sessions are marked. */
  readonly marked: number
}

export interface SessionRow {
  readonly kind: "session"
  readonly session: CatalogedSession
  /** Null when only one pane is open. */
  readonly match: Match | null
  readonly marked: boolean
}

/** One session id with its copy on each side (either may be missing). */
export interface PairRow {
  readonly kind: "pair"
  readonly id: string
  readonly left: CatalogedSession | null
  readonly right: CatalogedSession | null
  readonly match: PairMatch
  readonly marked: boolean
}

export type BrowserRow = GroupRow | SessionRow | PairRow

export interface ListPosition {
  readonly collapsed: readonly string[]
  readonly cursor: number
  readonly offset: number
}

export interface PaneState extends ListPosition {
  readonly catalog: ProfileCatalog
  /** Where the catalog was read from when the profile could not be read in place. */
  readonly snapshot: string | null
}

export type Direction = "to-right" | "to-left"

/** What to do when the target already has Magic Context state for the session. */
export type Resolution = "replace" | "skip"

/** Copy one session's Magic Context state to the other side. */
export interface QueueEntry {
  readonly id: string
  readonly title: string | null
  readonly direction: Direction
  readonly source: MagicContextSessionStats
  /** The target has its own state for this session. */
  readonly conflict: boolean
  /** Null while a conflict is undecided; "replace" for an entry without conflict. */
  readonly resolution: Resolution | null
}

export interface BrowserState {
  readonly left: PaneState
  readonly right: PaneState | null
  readonly paired: ListPosition
  readonly layout: "panes" | "paired"
  readonly focus: Side
  readonly filter: string
  readonly editingFilter: boolean
  /** How many rows a list shows at once. */
  readonly listHeight: number
  /** Marked session ids; a mark covers the session on both sides. */
  readonly marked: readonly string[]
  readonly queue: readonly QueueEntry[]
  readonly view: "list" | "queue"
  readonly queueCursor: number
  /** One line about what the last action did, until the next action. */
  readonly notice: string | null
}

export type BrowserAction =
  | { readonly type: "move"; readonly delta: number }
  | { readonly type: "page"; readonly direction: 1 | -1 }
  | { readonly type: "home" }
  | { readonly type: "end" }
  | { readonly type: "toggle" }
  | { readonly type: "focus"; readonly side?: Side }
  | { readonly type: "select"; readonly list: ListId; readonly index: number }
  | { readonly type: "scroll"; readonly list: ListId; readonly delta: number }
  | { readonly type: "layout" }
  | { readonly type: "mark" }
  | { readonly type: "mark-all" }
  | { readonly type: "enqueue"; readonly direction: Direction }
  | { readonly type: "view"; readonly view?: "list" | "queue" }
  | { readonly type: "queue-move"; readonly delta: number }
  | { readonly type: "resolve"; readonly resolution: Resolution; readonly all?: boolean }
  | { readonly type: "unqueue" }
  | { readonly type: "queue-clear" }
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
