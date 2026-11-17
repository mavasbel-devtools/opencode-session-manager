import type { Installation } from "@session-manager/domain/model/patches/Installation"
import type { PatchDefinition, PatchedFile } from "@session-manager/domain/model/patches/Patch"
import type { FileStatus } from "@session-manager/domain/model/patches/Status"

/** A patch on one installation: every command works on these pairs. */
export interface Target {
  readonly installation: Installation
  readonly patch: PatchDefinition
}

/** A patched file as found on disk. */
export interface FileOnDisk {
  readonly file: PatchedFile
  readonly location: string
  readonly bytes: Uint8Array | null
  readonly status: FileStatus
}
