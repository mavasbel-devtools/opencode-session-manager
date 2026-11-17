import type { FollowReport } from "@session-manager/domain/model/patches/Reports"

export interface PatchFollowRollbackPort {
  /** Puts back the Magic Context entry opencode.jsonc had before the last adoption. */
  rollback(): Promise<FollowReport>
}
