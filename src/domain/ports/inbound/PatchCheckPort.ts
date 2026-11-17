import type { CheckReport } from "@session-manager/domain/model/patches/Reports"

export interface PatchCheckPort {
  check(): Promise<CheckReport>
}
