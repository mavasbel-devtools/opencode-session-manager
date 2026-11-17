import type { InspectReport } from "@session-manager/domain/model/patches/Reports"

export interface PatchInspectPort {
  inspect(version: string): Promise<InspectReport>
}
