import type { MagicContextRelease, MagicContextUpgradeOutcome } from "@session-manager/domain/model/MagicContextRelease"

/** Outbound port: the installed Magic Context plugin, used only through its own store code. */
export interface MagicContextReleasePort {
  /** The installed release, or null when none is installed. */
  installed(): MagicContextRelease | null
  /** Where `installed()` looked, for the error that names them. */
  searched(): readonly string[]
  /** Runs the release's own open-and-migrate on a store copy. Never called on a live store. */
  upgrade(release: MagicContextRelease, copyPath: string): MagicContextUpgradeOutcome
}
