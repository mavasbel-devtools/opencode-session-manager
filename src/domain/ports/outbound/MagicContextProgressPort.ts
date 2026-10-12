import type { RebuildSnapshot } from "@session-manager/domain/model/Rebuild"

/** Outbound port: a session's Magic Context progress, read-only. */
export interface MagicContextProgressPort {
  /** The session's progress now; `runs` holds the historian runs recorded at or after `since`. */
  snapshot(contextDb: string, sessionId: string, since: number, now: number): RebuildSnapshot
}
