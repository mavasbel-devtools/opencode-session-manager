import type { MagicContextVersions } from "@session-manager/domain/model/MagicContextRelease"
import type { MagicContextVersionsPort } from "@session-manager/domain/ports/inbound/MagicContextVersionsPort"
import type { MagicContextConfigPort } from "@session-manager/domain/ports/outbound/MagicContextConfigPort"
import type { PublishedVersionPort } from "@session-manager/domain/ports/outbound/PublishedVersionPort"
import { compareVersions } from "@session-manager/domain/services/Versions"

/**
 * The Magic Context this machine's OpenCode loads (the spec its configuration pins, resolved to the
 * copy OpenCode installed for it) and the newest one npm publishes. The registry is only asked when
 * `withLatest` is called; without a registry (offline) the answer says so.
 */
export class MagicContextVersionsUseCase implements MagicContextVersionsPort {
  private readonly config: MagicContextConfigPort
  private readonly registry: PublishedVersionPort | null

  constructor(config: MagicContextConfigPort, registry: PublishedVersionPort | null) {
    this.config = config
    this.registry = registry
  }

  local(): MagicContextVersions {
    const pinned = this.config.pinned()
    return { pinned, loaded: pinned === null ? null : this.config.installed(pinned), latest: null }
  }

  async withLatest(local: MagicContextVersions): Promise<MagicContextVersions> {
    if (this.registry === null) return { ...local, latest: "offline" }
    return { ...local, latest: (await this.registry.latest()) ?? "unknown" }
  }

  newer(versions: MagicContextVersions): boolean {
    const { loaded, latest } = versions
    if (loaded === null || latest === null || latest === "offline" || latest === "unknown") return false
    return compareVersions(latest, loaded) > 0
  }
}
