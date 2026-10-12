import type { ProjectRecord } from "@session-manager/domain/model/Session"
import type { TextRewriter } from "@session-manager/domain/services/PathRewriter"
import type { StoreHealth } from "@session-manager/domain/ports/outbound/MagicContextSyncStorePort"

/** The target-side values of one session row: everything else is the source's, its text rewritten. */
export interface SessionRowPlan {
  readonly id: string
  readonly projectId: string
  readonly directory: string
  /** `session.path`: the folder relative to its project's worktree (null at the worktree itself). */
  readonly path: string | null
}

/** A project the target must hold for the copied sessions. */
export interface ProjectPlan {
  readonly id: string
  readonly worktree: string
  readonly vcs: string | null
  /** The source project whose other columns (name, icon, …) the new row takes, when there is one. */
  readonly templateId: string | null
}

/** One session with its sub-agent sessions, copied in one go. */
export interface SessionCopyPlan {
  readonly root: string
  /** The root first, then its sub-agent sessions. */
  readonly sessions: readonly SessionRowPlan[]
  readonly projects: readonly ProjectPlan[]
  /** Rewrites every copied text cell (null: copied unchanged). */
  readonly rewriter: TextRewriter | null
  /** Epoch milliseconds, for the timestamps of a project row made from nothing. */
  readonly now: number
}

export interface SessionCopyResult {
  readonly root: string
  readonly sessions: number
  readonly rows: number
  readonly residual_windows_paths: number
}

/**
 * The source's version of a session written into the target as an OpenCode fork of the target's own
 * version, at the last message both share: the target's settled messages through it, then the
 * source's settled messages after it, all under the fork's ids (OpenCode's `projectFork` layout).
 */
export interface ForkPlan {
  /** The session in the source store whose later messages the fork takes. */
  readonly sourceId: string
  /** The target session the fork branches from. */
  readonly parentId: string
  readonly forkId: string
  /** `msg_…`: the fork's messages are `<messageBase>_<seq>`. */
  readonly messageBase: string
  readonly slug: string
  /** The last message (an id of the parent's) both histories share: the fork's `through` boundary. */
  readonly boundaryMessageId: string
  /** Rewrites the source's copied text (null: unchanged). */
  readonly rewriter: TextRewriter | null
  /** Epoch milliseconds: the fork's creation time. */
  readonly now: number
}

export interface ForkResult {
  readonly fork_id: string
  readonly parent_id: string
  /** The parent's messages through the boundary, and the source's after it. */
  readonly inherited_messages: number
  readonly appended_messages: number
  readonly residual_windows_paths: number
}

/** What the target holds for one session after a copy. */
export interface StoredSessionRow {
  readonly projectId: string
  readonly directory: string
  readonly projectExists: boolean
}

/**
 * Outbound port: reading OpenCode stores for a sync, and writing sessions into a working copy of
 * the target (never a live store). Every table keyed by the session is copied: those with a
 * `session_id` column, the session tables themselves, its event log (`event_sequence`, `event`),
 * the instruction blobs its instruction state names, and the plugin storage keys that name it.
 */
export interface SessionSyncStorePort {
  /** The store's applied OpenCode migrations, in order: two stores exchange rows only when they match. */
  formatOf(dbPath: string): readonly string[]
  projects(dbPath: string): readonly ProjectRecord[]
  /** Sessions a plugin ran for its own work and marked hidden (Magic Context's `hidden-run` metadata). */
  hiddenRuns(dbPath: string): readonly string[]
  /** Replaces each family's rows in `targetDb` with the source's, in one transaction. */
  copySessions(sourceDb: string, targetDb: string, plans: readonly SessionCopyPlan[]): readonly SessionCopyResult[]
  /** Writes each fork into `targetDb`, in one transaction (see `ForkPlan`). */
  forkSessions(sourceDb: string, targetDb: string, plans: readonly ForkPlan[]): readonly ForkResult[]
  /** The session row as stored (v2 first), or null. */
  storedSession(dbPath: string, sessionId: string): StoredSessionRow | null
  health(dbPath: string): StoreHealth
}
