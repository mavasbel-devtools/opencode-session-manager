import { PatchError } from "@session-manager/domain/errors/PatchError"
import type { Installation } from "@session-manager/domain/model/patches/Installation"
import type { PatchDefinition } from "@session-manager/domain/model/patches/Patch"
import type { PatchFilter } from "@session-manager/domain/model/patches/Reports"
import type { Target } from "@session-manager/domain/model/patches/PatchTargets"
import type { InstallationsPort } from "@session-manager/domain/ports/outbound/InstallationsPort"
import type { TextSourcePort } from "@session-manager/domain/ports/outbound/TextSourcePort"
import { pinnedMagicContext } from "@session-manager/domain/services/Jsonc"

export interface Catalog {
  readonly loadedSpec: string | null
  readonly installations: readonly Installation[]
}

/** The installed copies, which one OpenCode loads, and the patch × installation pairs a command works on. */
export class InstallationCatalog {
  constructor(
    private readonly installations: InstallationsPort,
    private readonly opencodeConfig: TextSourcePort,
    private readonly patches: readonly PatchDefinition[],
  ) {}

  async load(): Promise<Catalog> {
    const text = await this.opencodeConfig.read()
    const loadedSpec = text === null ? null : pinnedMagicContext(text)
    const copies = await this.installations.list()
    return { loadedSpec, installations: copies.map((copy) => ({ ...copy, loaded: copy.spec === loadedSpec })) }
  }

  /** Every patch (or the one named) on the loaded copies (or every copy of the version named), in apply order, or reversed for undo. */
  async targets(filter: PatchFilter, order: "apply" | "undo" = "apply"): Promise<readonly Target[]> {
    const patches = filter.patch === undefined ? this.patches : this.patches.filter((patch) => patch.id === filter.patch)
    if (patches.length === 0) {
      throw new PatchError("usage", `unknown patch ${filter.patch}; known: ${this.patches.map((patch) => patch.id).join(", ")}`)
    }
    const ordered = order === "undo" ? [...patches].reverse() : patches
    const catalog = await this.load()
    const installations = catalog.installations.filter((installation) =>
      filter.version === undefined ? installation.loaded : installation.version === filter.version,
    )
    if (installations.length === 0) {
      throw new PatchError(
        "not-installed",
        filter.version === undefined
          ? `no installed Magic Context for the configured spec ${catalog.loadedSpec ?? "(none: not in opencode.jsonc)"}`
          : `Magic Context ${filter.version} is not installed`,
      )
    }
    return installations.flatMap((installation) => ordered.map((patch) => ({ installation, patch })))
  }
}
