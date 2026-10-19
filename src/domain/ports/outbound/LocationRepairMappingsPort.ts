import type { MapRule } from "@session-manager/domain/model/SessionSync"

/** Explicit, user-owned mappings that make an online location repair unambiguous. */
export interface LocationRepairMappingsPort {
  mappings(): readonly MapRule[]
}
