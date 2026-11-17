import type { Installation } from "@session-manager/domain/model/patches/Installation"
import type { CheckedBy } from "@session-manager/domain/model/patches/Patch"

/** A file compared with a patch release: untouched upstream, patched, something else, or absent. */
export type FileState = "original" | "patched" | "changed" | "missing"

/**
 * A patch on one installation:
 * - `applied` / `not-applied`: every file is patched / every file is original;
 * - `partial`: some files patched, the rest original;
 * - `changed`: a file matches neither checksum, so it is left alone;
 * - `missing-file`: a file the patch changes is absent;
 * - `unchecked-version`: the patch has not been checked against this version.
 */
export type PatchState = "applied" | "not-applied" | "partial" | "changed" | "missing-file" | "unchecked-version"

export interface FileStatus {
  readonly path: string
  readonly state: FileState
  readonly sha: string | null
}

export interface PatchStatus {
  readonly patch: string
  readonly installation: Installation
  readonly state: PatchState
  /** Who checked the release the files are compared with; null for an unchecked version. */
  readonly checked: CheckedBy | null
  readonly files: readonly FileStatus[]
}
