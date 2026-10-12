import type { StaleLock } from "@session-manager/domain/model/StoreLock"
import type { BuildAndVerifyResult } from "@session-manager/domain/model/Build"

export interface CompactInput {
  readonly dbPath: string
  readonly image: string
}

export interface CompactOutcome {
  readonly swapped: boolean
  readonly build: BuildAndVerifyResult
  /** The backup's `report.json` when swapped, otherwise `<target>.report.json`. */
  readonly reportPath: string
  /** The kept failed copy when `swapped` is false, otherwise null. */
  readonly failedTarget: string | null
  readonly backupDir: string | null
  readonly beforeBytes: number | null
  readonly afterBytes: number | null
  readonly postIntegrityOk: boolean
  /** Locks left by processes that no longer exist, removed before the run. */
  readonly staleLocksCleared: readonly StaleLock[]
}

export interface CompactPort {
  execute(input: CompactInput): CompactOutcome
}
