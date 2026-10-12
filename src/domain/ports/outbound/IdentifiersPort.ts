/** Outbound port: new OpenCode identifiers, made the way OpenCode makes them. */
export interface IdentifiersPort {
  /** A new session id (`ses_…`, descending). */
  sessionId(): string
  /** A new message id (`msg_…`, ascending): a fork's message ids are `<this>_<seq>`. */
  messageBase(): string
  /** A new session slug (`<adjective>-<noun>`). */
  slug(): string
}
