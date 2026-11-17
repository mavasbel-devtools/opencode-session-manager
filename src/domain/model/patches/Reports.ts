import type { EffectSummary, EffectVerdict } from "@session-manager/domain/services/patches/EffectReading"
import type { Installation } from "@session-manager/domain/model/patches/Installation"
import type { PatchState, PatchStatus } from "@session-manager/domain/model/patches/Status"

export interface StatusReport {
  /** The version spec opencode.jsonc pins (`0.47.0`, `latest`), or null when Magic Context is not configured. */
  readonly loadedSpec: string | null
  readonly installations: readonly Installation[]
  readonly patches: readonly PatchStatus[]
}

/** Which patches, on which installations: every patch on the loaded copy unless narrowed. */
export interface PatchFilter {
  readonly patch?: string
  readonly version?: string
}

export type Outcome = "applied" | "already-applied" | "reverted" | "already-original" | "refused" | "failed"

export interface FileChange {
  readonly path: string
  readonly from: string | null
  readonly to: string | null
}

export interface ActionResult {
  readonly patch: string
  readonly installation: Installation
  readonly outcome: Outcome
  readonly reason: string | null
  readonly files: readonly FileChange[]
}

export interface ActionReport {
  readonly results: readonly ActionResult[]
  readonly auditLog: string
}

export interface CheckProblem {
  readonly patch: string
  readonly version: string
  readonly root: string
  readonly state: PatchState
}

export interface CheckReport {
  readonly ok: boolean
  readonly loadedSpec: string | null
  /** Why the check failed before looking at any patch (nothing configured or installed). */
  readonly reason: string | null
  readonly problems: readonly CheckProblem[]
}

export interface InspectFile {
  readonly path: string
  /** Occurrences of the text the patch replaces. */
  readonly count: number
  /** How many the checked release expects in a file of this path, or null when it does not change this path. */
  readonly expected: number | null
  /** Occurrences of the replacement text (a file already patched). */
  readonly replaced: number
  readonly sha: string
  /** The file has the same path and checksum as in the release the patch was checked against. */
  readonly sameAsChecked: boolean
  readonly snippets: readonly string[]
}

export interface InspectFinding {
  readonly patch: string
  /** The newest version the patch was checked against, whose files are the comparison. */
  readonly checkedVersion: string
  readonly find: string
  readonly files: readonly InspectFile[]
}

export interface InspectReport {
  readonly version: string
  readonly roots: readonly string[]
  readonly findings: readonly InspectFinding[]
}

export interface EffectReport {
  readonly log: string
  readonly since: number | null
  readonly configured: number | null
  readonly summary: EffectSummary
  readonly verdict: EffectVerdict
}

export type FollowStepName = "detect" | "stage" | "locate" | "patch" | "prove" | "publish" | "confirm" | "record" | "rollback"

/** One step of a `follow` (or `follow --rollback`) run and what it found. */
export interface FollowStep {
  readonly step: FollowStepName
  readonly ok: boolean
  readonly detail: string
  /** Milliseconds since the previous step ended (or the run started). */
  readonly ms: number
}

/**
 * - `up-to-date`: nothing newer than what OpenCode loads;
 * - `adopted`: a patched copy was published, OpenCode loads it, and the configuration is in effect;
 * - `stopped`: a step refused; OpenCode keeps loading what it loaded before;
 * - `rolled-back`: the previous entry is back in opencode.jsonc;
 * - `busy`: another run holds the lock.
 */
export type FollowOutcome = "up-to-date" | "adopted" | "stopped" | "rolled-back" | "busy"

export interface FollowReport {
  readonly outcome: FollowOutcome
  readonly version: string | null
  /** The Magic Context entry of opencode.jsonc before and after the run. */
  readonly from: string | null
  readonly to: string | null
  readonly steps: readonly FollowStep[]
  /** The evidence file written for an adopted version. */
  readonly evidence: string | null
  readonly auditLog: string
}

export interface NotifyReport {
  readonly ok: boolean
  readonly notified: boolean
  readonly message: string | null
}
