import type { Profile } from "@session-manager/domain/model/Profile"

/** OpenCode keeps v1 sessions (`session`, `message`, `part`) and v2 sessions (`session_v2`, `session_message`) side by side. */
export type SessionGeneration = "v1" | "v2"

/** A session as its OpenCode store records it. Times are milliseconds since the epoch. */
export interface StoredSession {
  readonly id: string
  readonly generation: SessionGeneration
  readonly projectId: string
  readonly parentId: string | null
  /** The session this one was forked from (v2 only). */
  readonly forkOf: string | null
  readonly title: string | null
  readonly directory: string
  readonly timeCreated: number
  readonly timeUpdated: number
  readonly timeArchived: number | null
  /** Messages (v1) or session entries (v2). */
  readonly entries: number
}

/** What Magic Context holds for one session. */
export interface MagicContextSessionStats {
  /** History summaries (the `<session-history>` compartments). */
  readonly compartments: number
  /** Tagged messages and tool outputs; `lastTag` is the highest `§N§` number. */
  readonly tags: number
  readonly lastTag: number | null
  readonly notes: number
  /** Memories this session created (they belong to its project). */
  readonly memoriesOriginated: number
  /** Magic Context's project identity for the session: `git:<root commit>` or `dir:<hash>`. */
  readonly project: string | null
}

/**
 * Whether Magic Context holds conversation state for the session: summaries, tags or session notes.
 * A recorded project or memories alone are not state of the session (Magic Context records the
 * project of every session it sees; memories belong to the project).
 */
export function hasContextState(stats: MagicContextSessionStats | null | undefined): boolean {
  return stats !== null && stats !== undefined && stats.compartments + stats.tags + stats.notes > 0
}

export interface MagicContextSummary {
  readonly available: boolean
  /** The store's format version (`schema_migrations`), or null when there is no store. */
  readonly schemaVersion: number | null
  readonly sessions: Readonly<Record<string, MagicContextSessionStats>>
}

export interface CatalogedSession extends StoredSession {
  readonly magicContext: MagicContextSessionStats | null
}

/** Everything one profile holds, newest session first. */
export interface ProfileCatalog {
  readonly profile: Profile
  readonly sessions: readonly CatalogedSession[]
  readonly magicContext: { readonly available: boolean; readonly schemaVersion: number | null }
}

export const NO_MAGIC_CONTEXT: MagicContextSummary = { available: false, schemaVersion: null, sessions: {} }
