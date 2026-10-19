import type { LocationRepairReport } from "@session-manager/domain/model/LocationRepair"

/** Repairs sessions whose configured old folder is absent and whose mapped replacement exists. */
export interface RepairSessionLocationsPort {
  /** With session IDs, inspects only those sessions; without them, inspects all. */
  execute(sessionIds?: readonly string[]): Promise<LocationRepairReport>
}
