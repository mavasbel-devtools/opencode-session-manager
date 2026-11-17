import type { DerivedRelease } from "@session-manager/domain/model/patches/Patch"

/** The releases `follow` derived and proved, kept so `status` and `undo` know their checksums. */
export interface DerivedReleasesPort {
  list(): Promise<readonly DerivedRelease[]>
  save(release: DerivedRelease): Promise<void>
}
