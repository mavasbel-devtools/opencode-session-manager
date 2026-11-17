import type { InstalledCopy } from "@session-manager/domain/model/patches/Installation"

/** The copies of Magic Context OpenCode has installed. */
export interface InstallationsPort {
  list(): Promise<readonly InstalledCopy[]>
}
