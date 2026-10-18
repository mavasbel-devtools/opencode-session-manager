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

/** Renamed folders' names: what replaces them, and the names themselves (what text naming one contains). */
export interface NameRewrite {
  readonly rewriter: TextRewriter
  readonly needles: readonly string[]
}

/**
 * What a text rewrite needs: the rewriter, what text still holding an old folder contains, and the
 * renamed names (null: no folder was renamed). With names, the project records of a store-wide
 * rewrite are rewritten too, by the names alone: a renamed folder is still the same project.
 */
export interface TextRewrite {
  readonly rewriter: TextRewriter
  readonly hints: readonly string[]
  readonly names: NameRewrite | null
  readonly scope: TextScope
}

/**
 * Outbound port: moving sessions inside one OpenCode store (a working copy, never a live store).
 * Project records (`project`, `project_directory`, `worktree`) describe the old projects and are
 * kept, except that a store-wide rewrite with renamed names rewrites those names in them.
 * Content-addressed instruction blobs (`instruction_blob`, keyed by the hash of their value) are
 * rewritten under the address of their new value, and the instruction states in scope repointed.
 */
export interface RelocationStorePort {
  /** Sets each session row's folder, project and `path` (both OpenCode generations), adding the projects it lacks; returns the rows written. */
  moveSessions(dbPath: string, moves: readonly SessionMove[], projects: readonly ProjectPlan[], now: number): number
  /** Rewrites every text cell (never keys) holding a hint, in place. */
  rewriteText(dbPath: string, rewrite: TextRewrite): TextRewriteCounts
}
