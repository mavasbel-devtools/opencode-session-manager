import type { SyncInput, SyncReport } from "@session-manager/domain/model/MagicContextSync"

/** Inbound port: copy sessions' Magic Context state from one profile's store to another's. */
export interface SyncMagicContextPort {
  sync(input: SyncInput): SyncReport
}
