import type { OpenedProfile } from "@session-manager/domain/model/Browser"
import type { Profile } from "@session-manager/domain/model/Profile"

/** Inbound port: read a profile for browsing, from a snapshot when it cannot be read in place. */
export interface OpenProfilePort {
  open(profile: Profile): OpenedProfile
  /** Removes the snapshot `open` made, if any. */
  close(opened: OpenedProfile): void
}
