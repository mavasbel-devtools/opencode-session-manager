import type { SessionSyncInput, SessionSyncReport } from "@session-manager/domain/model/SessionSync"

/** Inbound port: copy whole sessions (OpenCode rows and Magic Context state) from one profile to another. */
export interface SyncSessionsPort {
  sync(input: SessionSyncInput): SessionSyncReport
}
