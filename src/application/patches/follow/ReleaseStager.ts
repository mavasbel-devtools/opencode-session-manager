import type { DerivedRelease, PatchDefinition, PatchedFile } from "@session-manager/domain/model/patches/Patch"
import type { StepLog } from "@session-manager/domain/model/patches/StepLog"
import type { FilesPort } from "@session-manager/domain/ports/outbound/FilesPort"
import type { HashPort } from "@session-manager/domain/ports/outbound/HashPort"
import type { ManagedStorePort } from "@session-manager/domain/ports/outbound/ManagedStorePort"
import type { PackageInstallerPort } from "@session-manager/domain/ports/outbound/PackageInstallerPort"
import type { PublishedVersion } from "@session-manager/domain/ports/outbound/RegistryPort"
import type { TranspilePort } from "@session-manager/domain/ports/outbound/TranspilePort"
import { MAGIC_CONTEXT_PACKAGE } from "@session-manager/domain/services/Jsonc"
import { type MatchedFile, locate, type SourceFile } from "@session-manager/domain/services/patches/MatcherRules"
import { releaseFor } from "@session-manager/domain/services/patches/PatchRules"

/** A patched copy in its staging folder, with the release derived for each patch. */
export interface StagedCopy {
  readonly folder: string
  readonly root: string
  readonly releases: readonly DerivedRelease[]
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error))
const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes)

/**
 * Steps stage, locate and patch: installs the published version into a new staging folder the way
 * OpenCode does, checks the tarball integrity, finds every patch's sites by matcher, and patches the
 * staged files (each must still parse and read back with the derived checksum). A version a person
 * reviewed must give exactly the reviewed checksums. The caller removes the folder when this fails.
 */
export class ReleaseStager {
  constructor(
    private readonly store: ManagedStorePort,
    private readonly installer: PackageInstallerPort,
    private readonly files: FilesPort,
    private readonly hash: HashPort,
    private readonly transpile: TranspilePort,
    private readonly patches: readonly PatchDefinition[],
  ) {}

  async stage(published: PublishedVersion, log: StepLog): Promise<{ folder: string; copy: StagedCopy | null }> {
    const folder = await this.store.stage(published.version)
    let root: string
    try {
      const installed = await this.installer.install(`${MAGIC_CONTEXT_PACKAGE}@${published.version}`, folder)
      if (installed.version !== published.version) {
        log.fail("stage", `the installer resolved ${installed.version}, not ${published.version}`)
        return { folder, copy: null }
      }
      if (installed.integrity !== published.integrity) {
        log.fail("stage", `tarball integrity ${installed.integrity ?? "(none)"} differs from the registry's ${published.integrity}`)
        return { folder, copy: null }
      }
      root = installed.root
      log.pass("stage", `installed ${published.version} into ${folder}; tarball integrity ${published.integrity} matches the registry`)
    } catch (error) {
      log.fail("stage", `installing ${published.version} failed: ${message(error)}`)
      return { folder, copy: null }
    }
    const releases = await this.patchEach(root, published.version, log)
    return { folder, copy: releases === null ? null : { folder, root, releases } }
  }

  /** The matcher's files of one patch, read from disk as they stand now (earlier patches already written). */
  private async sources(root: string, patch: PatchDefinition): Promise<SourceFile[]> {
    const sources: SourceFile[] = []
    for (const file of await this.files.list(`${root}/${patch.matcher.directory}`, patch.matcher.extension)) {
      const bytes = (await this.files.read(`${root}/${patch.matcher.directory}/${file}`))!
      sources.push({ path: `${patch.matcher.directory}/${file}`, text: decode(bytes) })
    }
    return sources
  }

  /**
   * Locates and patches each patch in order, one after the other: a file two patches change holds the
   * earlier one's result when the later matcher reads it, so the later release's `before` is that result.
   * Each patched file must still parse and read back with the derived checksum; a version a person
   * reviewed must come out exactly as reviewed.
   */
  private async patchEach(root: string, version: string, log: StepLog): Promise<DerivedRelease[] | null> {
    const releases: DerivedRelease[] = []
    const located: string[] = []
    const written: string[] = []
    for (const patch of this.patches) {
      const result = locate(patch.matcher, await this.sources(root, patch))
      if (!result.ok) return log.fail("locate", `${patch.id}: ${result.reason}`) || null
      const shapes = (file: MatchedFile) => file.shapes.map((shape) => `${shape.count} × ${JSON.stringify(shape.find)}`).join(", ")
      located.push(`${patch.id}: ${result.files.map((file) => `${file.path} (${shapes(file)})`).join(", ")}`)
      const files: PatchedFile[] = []
      for (const file of result.files) {
        const error = this.transpile.error(file.patched)
        if (error !== null) return log.fail("patch", `${patch.id}: ${file.path} no longer parses after patching: ${error}`) || null
        const bytes = new TextEncoder().encode(file.patched)
        const derived: PatchedFile = {
          path: file.path,
          before: this.hash.sha256(new TextEncoder().encode(file.text)),
          after: this.hash.sha256(bytes),
          replacements: file.shapes,
        }
        // A version a person reviewed must come out exactly as reviewed: same files, same checksums.
        const reviewed = releaseFor(patch, version)
        const same = reviewed?.files.find((entry) => entry.path === file.path)
        if (reviewed !== undefined && (same?.before !== derived.before || same.after !== derived.after)) {
          return log.fail("patch", `${patch.id}: ${file.path} does not give the reviewed ${version} checksums`) || null
        }
        await this.files.replace(`${root}/${file.path}`, bytes)
        const reread = await this.files.read(`${root}/${file.path}`)
        if (reread === null || this.hash.sha256(reread) !== derived.after) {
          return log.fail("patch", `${patch.id}: ${file.path} did not read back with sha256 ${derived.after}`) || null
        }
        files.push(derived)
        written.push(`${patch.id} ${file.path} ${derived.before.slice(0, 12)}→${derived.after.slice(0, 12)}`)
      }
      releases.push({ patch: patch.id, release: { version, files } })
    }
    log.pass("locate", located.join("; "))
    log.pass("patch", written.join("; "))
    return releases
  }
}
