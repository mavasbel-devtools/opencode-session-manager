import type { ActionReport, PatchFilter } from "@session-manager/domain/model/patches/Reports"

export interface PatchUndoPort {
  undo(filter: PatchFilter): Promise<ActionReport>
}
