import type { ReleaseCatalog } from "@session-manager/application/patches/ReleaseCatalog"
import type { Installation } from "@session-manager/domain/model/patches/Installation"
import type { PatchDefinition, PatchedFile } from "@session-manager/domain/model/patches/Patch"
import type { FileOnDisk } from "@session-manager/domain/model/patches/PatchTargets"
import type { FileStatus, PatchStatus } from "@session-manager/domain/model/patches/Status"
import type { FilesPort } from "@session-manager/domain/ports/outbound/FilesPort"
import type { HashPort } from "@session-manager/domain/ports/outbound/HashPort"
import { fileState, patchState } from "@session-manager/domain/services/patches/PatchRules"

/** Reads and classifies the files a patch changes on one installation. */
export class PatchInspector {
  constructor(
    private readonly files: FilesPort,
    private readonly hash: HashPort,
    private readonly releases: ReleaseCatalog,
    private readonly patches: readonly PatchDefinition[],
  ) {}

  /**
   * The checksums later patches give the same file on the same version, in apply order. A file two
   * patches change holds the last applied one's result, which still counts as patched for the earlier.
   */
  async later(version: string, path: string, patch: PatchDefinition): Promise<readonly string[]> {
    const index = this.patches.findIndex((entry) => entry.id === patch.id)
    if (index === -1) return []
    const shas: string[] = []
    for (const entry of this.patches.slice(index + 1)) {
      const found = await this.releases.find(entry, version)
      const file = found?.release.files.find((candidate) => candidate.path === path)
      if (file !== undefined) shas.push(file.after)
    }
    return shas
  }

  /**
   * The checksums earlier patches give the same file on the same version. Before they are applied, a
   * file two patches change is still the first one's original, not a file changed by something else.
   */
  async earlier(version: string, path: string, patch: PatchDefinition): Promise<readonly string[]> {
    const index = this.patches.findIndex((entry) => entry.id === patch.id)
    if (index === -1) return []
    const shas: string[] = []
    for (const entry of this.patches.slice(0, index)) {
      const found = await this.releases.find(entry, version)
      const file = found?.release.files.find((candidate) => candidate.path === path)
      if (file !== undefined) shas.push(file.before)
    }
    return shas
  }

  async read(installation: Installation, file: PatchedFile, later: readonly string[] = [], earlier: readonly string[] = []): Promise<FileOnDisk> {
    const location = `${installation.root}/${file.path}`
    const bytes = await this.files.read(location)
    const sha = bytes === null ? null : this.hash.sha256(bytes)
    return { file, location, bytes, status: { path: file.path, state: fileState(file, sha, later, earlier), sha } }
  }

  private async readFiles(installation: Installation, patch: PatchDefinition, files: readonly PatchedFile[]): Promise<readonly FileOnDisk[]> {
    const read: FileOnDisk[] = []
    for (const file of files)
      read.push(
        await this.read(installation, file, await this.later(installation.version, file.path, patch), await this.earlier(installation.version, file.path, patch)),
      )
    return read
  }

  async readAll(installation: Installation, patch: PatchDefinition): Promise<readonly FileOnDisk[] | null> {
    const found = await this.releases.find(patch, installation.version)
    if (found === undefined) return null
    return this.readFiles(installation, patch, found.release.files)
  }

  async status(installation: Installation, patch: PatchDefinition): Promise<PatchStatus> {
    const found = await this.releases.find(patch, installation.version)
    if (found === undefined) return { patch: patch.id, installation, state: "unchecked-version", checked: null, files: [] }
    const files = (await this.readFiles(installation, patch, found.release.files)).map((entry) => entry.status)
    return { patch: patch.id, installation, state: patchState(files.map((file) => file.state)), checked: found.checked, files }
  }
}
