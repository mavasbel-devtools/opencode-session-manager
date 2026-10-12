import type { ContextTextRewriteCounts } from "@session-manager/domain/model/Relocate"
import type { TextRewrite } from "@session-manager/domain/ports/outbound/RelocationStorePort"

/** One session's Magic Context project after the move. */
export interface ContextLink {
  readonly sessionId: string
  readonly project: string
}

/**
 * Outbound port: moving sessions inside one Magic Context store (a working copy). Merging an old
 * project into a new one goes through `MagicContextSyncStorePort.copySessions`.
 */
export interface MagicContextRelocationStorePort {
  /** Points each session's recorded project at its new one and clears its cached prompt snapshots; returns the rows changed. */
  relink(dbPath: string, links: readonly ContextLink[]): number
  /** Rewrites every text cell (never keys) holding a hint, in place; a memory's key follows its text. */
  rewriteText(dbPath: string, rewrite: TextRewrite): ContextTextRewriteCounts
}
