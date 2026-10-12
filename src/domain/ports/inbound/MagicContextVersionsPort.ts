import type { MagicContextVersions } from "@session-manager/domain/model/MagicContextRelease"

/** Inbound port: which Magic Context this machine runs, and whether a newer one is published. */
export interface MagicContextVersionsPort {
  /** From the configuration and the installed copy only (no network); `latest` is null. */
  local(): MagicContextVersions
  /** `local()` with the newest published version (`unknown` when the registry does not answer). */
  withLatest(local: MagicContextVersions): Promise<MagicContextVersions>
  /** Whether the published version is newer than the loaded one. */
  newer(versions: MagicContextVersions): boolean
}
