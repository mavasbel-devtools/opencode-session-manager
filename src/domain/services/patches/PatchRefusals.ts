import type { FileOnDisk, Target } from "@session-manager/domain/model/patches/PatchTargets"

/** Shared refusals of apply and undo: an unchecked version, a missing file, a file changed some other way. */
export function blocker(target: Target, onDisk: readonly FileOnDisk[] | null): string | null {
  if (onDisk === null) {
    const version = target.installation.version
    return `${target.patch.id} has not been checked against Magic Context ${version}; review it with \`inspect --version ${version}\``
  }
  const missing = onDisk.find((entry) => entry.status.state === "missing")
  if (missing !== undefined) return `${missing.file.path} is missing`
  const changed = onDisk.find((entry) => entry.status.state === "changed")
  if (changed !== undefined) return `${changed.file.path} matches neither recorded checksum (sha256 ${changed.status.sha})`
  return null
}
