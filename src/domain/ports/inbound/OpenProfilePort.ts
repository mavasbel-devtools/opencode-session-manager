import type { OpenedProfile } from "@session-manager/domain/model/Browser"

/** Inbound port: read a profile for browsing, from a snapshot when it cannot be read in place. */
export interface OpenProfilePort {
  open(name: string, dataHome: string): OpenedProfile
  /** Removes the snapshot `open` made, if any. */
  close(opened: OpenedProfile): void
}
