import type { CheckedBy, PatchDefinition, PatchRelease } from "@session-manager/domain/model/patches/Patch"
import type { DerivedReleasesPort } from "@session-manager/domain/ports/outbound/DerivedReleasesPort"
import { releaseFor } from "@session-manager/domain/services/patches/PatchRules"

export interface CheckedRelease {
  readonly release: PatchRelease
  readonly checked: CheckedBy
}

/** The release of a patch for a version: the reviewed one from `patches/`, else the one `follow` derived and proved. */
export class ReleaseCatalog {
  constructor(private readonly derived: DerivedReleasesPort) {}

  async find(patch: PatchDefinition, version: string): Promise<CheckedRelease | undefined> {
    const reviewed = releaseFor(patch, version)
    if (reviewed !== undefined) return { release: reviewed, checked: "reviewed" }
    const auto = (await this.derived.list()).find((entry) => entry.patch === patch.id && entry.release.version === version)
    return auto === undefined ? undefined : { release: auto.release, checked: "auto" }
  }
}
