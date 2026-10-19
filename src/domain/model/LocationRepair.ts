import type { MapRule } from "@session-manager/domain/model/SessionSync"

/** One session whose missing recorded folder has one proven replacement. */
export interface LocationRepair {
  readonly session_id: string
  readonly from_directory: string
  readonly to_directory: string
}

/** Why a session was deliberately left untouched by an online location repair. */
export type LocationRepairSkipReason = "directory-present" | "not-mapped" | "target-missing"

export interface LocationRepairSkip {
  readonly session_id: string
  readonly directory: string
  readonly reason: LocationRepairSkipReason
  readonly to_directory: string | null
}

/** Result of an online repair. Session moves are always delegated to OpenCode. */
export interface LocationRepairReport {
  readonly rules: readonly MapRule[]
  readonly repaired: readonly LocationRepair[]
  readonly skipped: readonly LocationRepairSkip[]
}
