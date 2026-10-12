import type { RelocateInput, RelocateReport } from "@session-manager/domain/model/Relocate"

/** Inbound port: `relocate`. */
export interface RelocateSessionsPort {
  relocate(input: RelocateInput): RelocateReport
}
