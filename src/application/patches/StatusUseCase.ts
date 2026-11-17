import type { InstallationCatalog } from "@session-manager/application/patches/InstallationCatalog"
import type { PatchInspector } from "@session-manager/application/patches/PatchInspector"
import type { PatchDefinition } from "@session-manager/domain/model/patches/Patch"
import type { StatusReport } from "@session-manager/domain/model/patches/Reports"
import type { PatchStatusPort } from "@session-manager/domain/ports/inbound/PatchStatusPort"

/** Every patch on every installed copy; reads only. */
export class StatusUseCase implements PatchStatusPort {
  constructor(
    private readonly catalog: InstallationCatalog,
    private readonly inspector: PatchInspector,
    private readonly patches: readonly PatchDefinition[],
  ) {}

  async status(): Promise<StatusReport> {
    const { loadedSpec, installations } = await this.catalog.load()
    const patches = await Promise.all(
      installations.flatMap((installation) => this.patches.map((patch) => this.inspector.status(installation, patch))),
    )
    return { loadedSpec, installations, patches }
  }
}
