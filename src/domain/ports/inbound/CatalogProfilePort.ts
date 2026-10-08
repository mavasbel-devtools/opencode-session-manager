import type { Profile } from "@session-manager/domain/model/Profile"
import type { ProfileCatalog } from "@session-manager/domain/model/SessionCatalog"

/** Inbound port: list one profile's sessions with what Magic Context holds for each. Read-only. */
export interface CatalogProfilePort {
  catalog(profile: Profile): ProfileCatalog
}
