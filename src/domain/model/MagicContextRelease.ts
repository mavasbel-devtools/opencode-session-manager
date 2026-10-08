/** The Magic Context plugin installed for OpenCode on this machine, as far as store formats go. */
export interface MagicContextRelease {
  /** The plugin's package version, e.g. `0.45.0`. */
  readonly version: string
  /** The newest store format (`schema_migrations` version) this release writes. */
  readonly latestFormat: number
  readonly packageDirectory: string
}

/** The outcome of bringing a store copy up to the installed format with Magic Context's own code. */
export type MagicContextUpgradeOutcome =
  | { readonly ok: true; readonly format: number }
  | { readonly ok: false; readonly detail: string }

/** What `context-copy` reports. Keys are snake_case like every report of this tool. */
export interface ContextCopyReport {
  readonly source: string
  readonly target: string
  readonly from_format: number | null
  readonly to_format: number
  readonly upgraded: boolean
  readonly magic_context_version: string
}
