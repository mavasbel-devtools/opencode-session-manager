/** Outbound port: the Magic Context OpenCode's configuration asks for, and the copy it installed. */
export interface MagicContextConfigPort {
  /** The version spec in opencode.jsonc, or null when the plugin is not configured (or there is no configuration). */
  pinned(): string | null
  /** The version of the copy OpenCode installed for `spec`, or null when there is none. */
  installed(spec: string): string | null
}
