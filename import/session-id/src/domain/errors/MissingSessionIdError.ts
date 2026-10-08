/** Message kept verbatim from the hand-written v2 `session-id` tool this plugin replaces. */
export const MISSING_SESSION_ID_MESSAGE =
  "State Inconsistency: 'sessionID' is undefined or null within the execution context."

export class MissingSessionIdError extends Error {
  constructor() {
    super(MISSING_SESSION_ID_MESSAGE)
  }
}
