import type { ActionReport, PatchFilter } from "@session-manager/domain/model/patches/Reports"

export interface PatchApplyPort {
  apply(filter: PatchFilter): Promise<ActionReport>
}
