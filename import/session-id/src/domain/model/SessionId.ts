import { MissingSessionIdError } from "@session-id/domain/errors/MissingSessionIdError"

/** Same guard as the replaced tool: only `undefined`/`null` are missing; anything else is stringified. */
export function requireSessionId(value: unknown): string {
  if (value === undefined || value === null) throw new MissingSessionIdError()
  return String(value)
}

/** Sidebar text: the raw session ID, unlabelled (decision D3 = A of the plugin plan). */
export function sidebarText(sessionID: string): string {
  return sessionID
}
