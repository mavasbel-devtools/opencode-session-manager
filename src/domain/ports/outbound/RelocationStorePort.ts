import type { TextRewriteCounts } from "@session-manager/domain/model/Relocate"
import type { ProjectPlan } from "@session-manager/domain/ports/outbound/SessionSyncStorePort"
import type { TextRewriter } from "@session-manager/domain/services/PathRewriter"

/** One session row's new place: its folder, the project OpenCode derives there, and `session.path`. */
export interface SessionMove {
  readonly id: string
  readonly directory: string
  readonly projectId: string
  /** The folder relative to the project's worktree (null at the worktree itself). */
  readonly path: string | null
}

/** Which rows a text rewrite touches: every row of the store, or only rows keyed by these sessions. */
export type TextScope = "all" | { readonly sessions: readonly string[] }

/** What a text rewrite needs: the rewriter, and what text still holding an old folder contains. */
export interface TextRewrite {
  readonly rewriter: TextRewriter
  readonly hints: readonly string[]
  readonly scope: TextScope
}

/**
 * Outbound port: moving sessions inside one OpenCode store (a working copy, never a live store).
 * Project records (`project`, `project_directory`, `worktree`) describe the old projects and are
 * kept; content-addressed blobs (`instruction_blob`, keyed by the hash of their text) are kept.
 */
export interface RelocationStorePort {
  /** Sets each session row's folder, project and `path` (both OpenCode generations), adding the projects it lacks; returns the rows written. */
  moveSessions(dbPath: string, moves: readonly SessionMove[], projects: readonly ProjectPlan[], now: number): number
  /** Rewrites every text cell (never keys) holding a hint, in place. */
  rewriteText(dbPath: string, rewrite: TextRewrite): TextRewriteCounts
}
