import type { StatusReport } from "@session-manager/domain/model/patches/Reports"

export interface PatchStatusPort {
  status(): Promise<StatusReport>
}
