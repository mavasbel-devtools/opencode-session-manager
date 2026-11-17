import type { FollowReport } from "@session-manager/domain/model/patches/Reports"

export interface PatchFollowPort {
  /** Adopts the newest published version (or `version`), already patched; see FollowUseCase. */
  follow(version: string | null): Promise<FollowReport>
}
