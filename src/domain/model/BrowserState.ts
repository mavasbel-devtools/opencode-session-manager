import type { ContextScope } from "@session-manager/domain/model/MagicContextSync"
import type { MagicContextVersions } from "@session-manager/domain/model/MagicContextRelease"
import type { RebuildCommand } from "@session-manager/domain/model/Rebuild"
import type { CatalogedSession, ProfileCatalog } from "@session-manager/domain/model/SessionCatalog"
import type { SessionHealth } from "@session-manager/domain/model/Verify"
import type { Diverged, Prefer, SessionAction, SessionRelation, SessionSkipReason } from "@session-manager/domain/model/SessionSync"

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

export interface PaneState extends ListPosition, OpenedProfile {}

export type Direction = "to-right" | "to-left"

/** What the last dry run or apply did with a queued session. */
export interface PlannedSync {
  readonly action: SessionAction
  readonly relation: SessionRelation | null
  readonly reason: SessionSkipReason | null
  /** What happened to its Magic Context state, in a few words (null: not part of the sync). */
  readonly context: string | null
}

/** Sync one whole session (its OpenCode rows, sub-agent sessions and Magic Context state) to the other side. */
export interface QueueEntry {
  readonly id: string
  readonly title: string | null
  readonly direction: Direction
  readonly source: CatalogedSession
  /** The target's copy of the session, or null when the target does not have it. */
  readonly target: CatalogedSession | null
  /** Whose Magic Context state wins when both sides hold the same history. */
  readonly prefer: Prefer
  /** When the two histories diverged: leave both, or write the source's as a fork on the target. */
  readonly diverged: Diverged
  /** Null until a dry run or an apply. */
  readonly planned: PlannedSync | null
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
  /** How much Magic Context state goes with the queued sessions. */
  readonly scope: ContextScope
  readonly view: "list" | "queue"
  readonly queueCursor: number
  /** One line about what the last action did, until the next action. */
  readonly notice: string | null
  /** What the last apply or dry run did, shown in the queue view. */
  readonly lastResult: readonly string[] | null
  /** The Magic Context this machine runs, and whether npm has a newer one (null: not known). */
  readonly release: MagicContextReleaseState | null
  /** A rebuild asked for once, waiting for the same key again (any other key cancels it). */
  readonly confirm: RebuildRequest | null
}

/** What a key runs through the OpenCode server on this machine's profile: a rebuild, or a fork. */
export type LiveCommand = RebuildCommand | "fork"

/** `/ctx-wrapup`, `/ctx-recomp` or a fork, on sessions of one side, through the OpenCode server running it. */
export interface RebuildRequest {
  readonly command: LiveCommand
  readonly side: Side
  readonly ids: readonly string[]
}

export interface MagicContextReleaseState {
  readonly versions: MagicContextVersions
  readonly newer: boolean
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
  | { readonly type: "prefer"; readonly all?: boolean }
  | { readonly type: "scope" }
  | { readonly type: "unqueue" }
  | { readonly type: "queue-clear" }
  | { readonly type: "filter-start" }
  | { readonly type: "filter-input"; readonly text: string }
  | { readonly type: "filter-backspace" }
  | { readonly type: "filter-commit" }
  | { readonly type: "filter-clear" }
  | { readonly type: "resize"; readonly listHeight: number }
  | { readonly type: "notice"; readonly text: string }
  | { readonly type: "release"; readonly release: MagicContextReleaseState }
  | { readonly type: "rebuild-ask"; readonly command: LiveCommand }
  | { readonly type: "diverged"; readonly all?: boolean }
  | {
      readonly type: "applied"
      readonly result: readonly string[]
      /** True when the target changed: the queue is done. */
      readonly changed: boolean
      /** What the run did with each queued session, by id. */
      readonly planned?: Readonly<Record<string, PlannedSync>>
      readonly left?: OpenedProfile
      readonly right?: OpenedProfile
    }

export interface OpenedProfile {
  readonly catalog: ProfileCatalog
  /** Where the catalog was read from when the profile could not be read in place. */
  readonly snapshot: string | null
  /** Each session's health (`verify`), by session id; absent when it was not checked. */
  readonly health?: Readonly<Record<string, SessionHealth>>
}
