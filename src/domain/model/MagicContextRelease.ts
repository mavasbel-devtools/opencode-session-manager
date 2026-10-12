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

/** The Magic Context OpenCode is configured to load on this machine, and the newest one published. */
export interface MagicContextVersions {
  /** The version spec in opencode.jsonc (`0.47.0`, `latest`), or null when the plugin is not configured. */
  readonly pinned: string | null
  /** The version OpenCode installed for that spec, or null when it has not installed it. */
  readonly loaded: string | null
  /** The newest version on npm: null until asked, "offline" when not asked, "unknown" when the registry did not answer. */
  readonly latest: string | null
}

/** One header line about the Magic Context this machine runs. */
export function versionsText(versions: MagicContextVersions, newer: boolean): string {
  if (versions.pinned === null) return "Magic Context: not configured in opencode.jsonc"
  const loaded = versions.loaded === null ? `${versions.pinned} (not installed yet)` : versions.pinned === versions.loaded ? versions.loaded : `${versions.loaded} (opencode.jsonc: ${versions.pinned})`
  const latest =
    versions.latest === null
      ? "checking npm…"
      : versions.latest === "offline"
        ? "npm not checked"
        : versions.latest === "unknown"
          ? "npm did not answer"
          : newer
            ? `${versions.latest} available on npm`
            : `up to date (npm ${versions.latest})`
  return `Magic Context ${loaded} · ${latest}`
}
