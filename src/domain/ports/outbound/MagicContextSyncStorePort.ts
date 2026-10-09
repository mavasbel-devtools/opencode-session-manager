import type { Harness, ProjectMergeResult, SessionCopy } from "@session-manager/domain/model/MagicContextSync"
import type { TextRewriter } from "@session-manager/domain/services/PathRewriter"

/** What a source store holds for one session. */
export interface SourceSessionState {
  /** The label of the rows to copy (the OpenCode 2 label wins), or null when there is nothing. */
  readonly harness: Harness | null
  /** Every message id the session's summaries start or end at. */
  readonly anchors: readonly string[]
  readonly project: string | null
  /** The last message ordinal the session's summaries cover under that label (0 without summaries). */
  readonly reach: number
}

export interface PlannedCopy {
  readonly copy: SessionCopy
  /** Rewrites the copied text (null: copied unchanged). */
  readonly rewriter: TextRewriter | null
}

export interface CopyResult {
  readonly id: string
  readonly compartments: number
  readonly tags: number
  readonly notes: number
  readonly memories_copied: number
  readonly memories_already_there: number
  readonly history_rows: number
  readonly residual_windows_paths: number
}

/** A source project whose state is merged into a target project. */
export interface ProjectMerge {
  readonly from: string
  readonly to: string
  /** Rewrites the merged text (null: copied unchanged). */
  readonly rewriter: TextRewriter | null
}

export interface CopyOptions {
  /** Copy the memories each session created with it (scope `sessions`; scope `all` merges whole projects instead). */
  readonly originatedMemories: boolean
  readonly projects: readonly ProjectMerge[]
  readonly userMemories: boolean
  /** Epoch milliseconds, for the timestamps the copy writes. */
  readonly now: number
}

export interface CopyOutcome {
  readonly sessions: readonly CopyResult[]
  readonly projects: readonly ProjectMergeResult[]
  readonly user_memories_copied: number
}

export interface StoredSessionState {
  readonly compartments: number
  readonly tags: number
  readonly notes: number
  readonly anchors: readonly string[]
}

export interface StoreHealth {
  readonly integrity_ok: boolean
  readonly foreign_keys_ok: boolean
}

/** Outbound port: reading and writing session state in Magic Context stores (working copies only). */
export interface MagicContextSyncStorePort {
  sourceState(contextDb: string, sessionId: string): SourceSessionState
  /** The project the store already records for the session, or null. */
  recordedProject(contextDb: string, sessionId: string): string | null
  /**
   * Replaces each session's state in `targetDb` with the source's and merges the projects' state, in
   * one transaction. Refuses a store holding tables or columns the Magic Context schema does not know.
   */
  copySessions(sourceDb: string, targetDb: string, copies: readonly PlannedCopy[], options: CopyOptions): CopyOutcome
  /** Whether Magic Context's own module manages the project's memory in this store (its writes are guarded). */
  authorityManaged(contextDb: string, project: string): boolean
  stateOf(contextDb: string, sessionId: string): StoredSessionState
  health(contextDb: string): StoreHealth
  /**
   * Whether Magic Context is working on the session at `now` (epoch milliseconds): a wrapup in
   * progress, or a history lease that has not expired.
   */
  busy(contextDb: string, sessionId: string, now: number): boolean
}
