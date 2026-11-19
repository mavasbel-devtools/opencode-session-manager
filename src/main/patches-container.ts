import { ApplyUseCase } from "@session-manager/application/patches/ApplyUseCase"
import { ChangeWriter } from "@session-manager/application/patches/ChangeWriter"
import { CheckUseCase } from "@session-manager/application/patches/CheckUseCase"
import { EffectUseCase } from "@session-manager/application/patches/EffectUseCase"
import { AdoptionRecorder } from "@session-manager/application/patches/follow/AdoptionRecorder"
import { EntrySwitcher } from "@session-manager/application/patches/follow/EntrySwitcher"
import { ConfigEntrySet } from "@session-manager/application/patches/follow/ConfigEntrySet"
import { PluginEntryEditor } from "@session-manager/application/patches/follow/PluginEntryEditor"
import { ReleaseProver } from "@session-manager/application/patches/follow/ReleaseProver"
import { ReleaseStager } from "@session-manager/application/patches/follow/ReleaseStager"
import { FollowUseCase } from "@session-manager/application/patches/FollowUseCase"
import { FollowRollbackUseCase } from "@session-manager/application/patches/FollowRollbackUseCase"
import { InspectUseCase } from "@session-manager/application/patches/InspectUseCase"
import { InstallationCatalog } from "@session-manager/application/patches/InstallationCatalog"
import { NotifyUseCase } from "@session-manager/application/patches/NotifyUseCase"
import { PatchInspector } from "@session-manager/application/patches/PatchInspector"
import { ReleaseCatalog } from "@session-manager/application/patches/ReleaseCatalog"
import { StatusUseCase } from "@session-manager/application/patches/StatusUseCase"
import { UndoUseCase } from "@session-manager/application/patches/UndoUseCase"
import type { PatchDefinition } from "@session-manager/domain/model/patches/Patch"
import type { PatchCommands } from "@session-manager/domain/model/patches/PatchCommands"
import type { FilesPort } from "@session-manager/domain/ports/outbound/FilesPort"
import type { PackageInstallerPort } from "@session-manager/domain/ports/outbound/PackageInstallerPort"
import { CompositeInstallationsAdapter } from "@session-manager/infrastructure/adapters/outbound/magic-context/CompositeInstallationsAdapter"
import { ManagedInstallationsAdapter } from "@session-manager/infrastructure/adapters/outbound/magic-context/ManagedInstallationsAdapter"
import { OpencodeCacheInstallationsAdapter } from "@session-manager/infrastructure/adapters/outbound/magic-context/OpencodeCacheInstallationsAdapter"
import { Sha256Adapter } from "@session-manager/infrastructure/adapters/outbound/crypto/Sha256Adapter"
import { FileKeyValueAdapter } from "@session-manager/infrastructure/adapters/outbound/fs/FileKeyValueAdapter"
import { FsFollowLockAdapter } from "@session-manager/infrastructure/adapters/outbound/fs/FsFollowLockAdapter"
import { FsBackupAdapter } from "@session-manager/infrastructure/adapters/outbound/fs/FsBackupAdapter"
import { FsEvidenceAdapter } from "@session-manager/infrastructure/adapters/outbound/fs/FsEvidenceAdapter"
import { FsManagedStoreAdapter } from "@session-manager/infrastructure/adapters/outbound/fs/FsManagedStoreAdapter"
import { JsonDerivedReleasesAdapter } from "@session-manager/infrastructure/adapters/outbound/fs/JsonDerivedReleasesAdapter"
import { JsonlAuditLogAdapter } from "@session-manager/infrastructure/adapters/outbound/fs/JsonlAuditLogAdapter"
import { NodeFilesAdapter } from "@session-manager/infrastructure/adapters/outbound/fs/NodeFilesAdapter"
import { TextFileAdapter } from "@session-manager/infrastructure/adapters/outbound/fs/TextFileAdapter"
import { ArboristInstallerAdapter } from "@session-manager/infrastructure/adapters/outbound/npm/ArboristInstallerAdapter"
import { NpmPackumentAdapter } from "@session-manager/infrastructure/adapters/outbound/npm/NpmPackumentAdapter"
import { OpencodeLivePluginsAdapter } from "@session-manager/infrastructure/adapters/outbound/opencode2/OpencodeLivePluginsAdapter"
import { OpencodeSandboxAdapter } from "@session-manager/infrastructure/adapters/outbound/opencode2/OpencodeSandboxAdapter"
import { BunTranspileAdapter } from "@session-manager/infrastructure/adapters/outbound/parse/BunTranspileAdapter"
import { SystemClockAdapter } from "@session-manager/infrastructure/adapters/outbound/system/SystemClockAdapter"
import type { PatchesPlatformAdapters } from "@session-manager/main/cli/platform"
import type { Paths } from "@session-manager/main/cli/patches-paths"

/**
 * Declared fault-injection seams: the e2e tier wraps the real files adapter to make a write read back
 * wrong and a restore fail, and the real installer to make it report another version or integrity,
 * which real files and Arborist never do on their own. Production passes nothing.
 */
export interface Seams {
  readonly files?: (real: FilesPort) => FilesPort
  readonly installer?: (real: PackageInstallerPort) => PackageInstallerPort
}

/** The single place the patches group's adapters and use cases are constructed. */
export function createPatchCommands(
  paths: Paths,
  patches: readonly PatchDefinition[],
  adapters: PatchesPlatformAdapters,
  seams: Seams = {},
): PatchCommands {
  const real = new NodeFilesAdapter()
  const files = seams.files?.(real) ?? real
  const hash = new Sha256Adapter()
  const clock = new SystemClockAdapter()
  const audit = new JsonlAuditLogAdapter(paths.auditLog)
  const backups = new FsBackupAdapter(paths.backups)
  const store = new FileKeyValueAdapter(paths.state)
  const notifier = adapters.notifier
  const derived = new JsonDerivedReleasesAdapter(paths.derivedReleases)
  const magicContextConfig = new TextFileAdapter(paths.magicContextConfig)
  const installations = new CompositeInstallationsAdapter([
    new OpencodeCacheInstallationsAdapter(paths.installations),
    new ManagedInstallationsAdapter(paths.installs),
  ])
  const catalog = new InstallationCatalog(installations, new TextFileAdapter(paths.opencodeConfig), patches)
  const inspector = new PatchInspector(files, hash, new ReleaseCatalog(derived), patches)
  const writer = new ChangeWriter(files, hash, backups, audit, clock)
  const status = new StatusUseCase(catalog, inspector, patches)
  const check = new CheckUseCase(status)
  const managed = new FsManagedStoreAdapter(paths.installs)
  const live = new OpencodeLivePluginsAdapter(paths.service)
  const lock = new FsFollowLockAdapter(paths.lock, adapters.liveness)
  const realInstaller = new ArboristInstallerAdapter(paths.registry, paths.npmCache)
  const installer = seams.installer?.(realInstaller) ?? realInstaller
  const entries = new ConfigEntrySet(
    files,
    new PluginEntryEditor(files, hash, backups, paths.opencodeConfig, "opencode.jsonc"),
    new PluginEntryEditor(files, hash, backups, paths.tuiConfig, "tui.jsonc"),
  )
  const switcher = new EntrySwitcher(
    entries,
    live,
    new TextFileAdapter(paths.magicContextLog),
    magicContextConfig,
    clock,
    paths.timing,
  )
  const recorder = new AdoptionRecorder(derived, new FsEvidenceAdapter(paths.evidence), audit, notifier, store, clock, paths.opencodeConfig, paths.tuiConfig)
  return {
    status,
    apply: new ApplyUseCase(catalog, inspector, writer, hash, audit),
    undo: new UndoUseCase(catalog, inspector, writer, backups, hash, audit),
    check,
    inspect: new InspectUseCase(catalog, files, hash, patches),
    effect: new EffectUseCase(
      new TextFileAdapter(paths.magicContextLog),
      adapters.service,
      magicContextConfig,
    ),
    notify: new NotifyUseCase(check, notifier, store),
    follow: new FollowUseCase(
      lock,
      catalog,
      new NpmPackumentAdapter(paths.registry),
      managed,
      new ReleaseStager(managed, installer, files, hash, new BunTranspileAdapter(), patches),
      new ReleaseProver(
        new OpencodeSandboxAdapter({ opencode: paths.opencode, parent: paths.sandboxes, ...paths.timing }),
        magicContextConfig,
      ),
      switcher,
      live,
      recorder,
      audit,
      clock,
    ),
    rollback: new FollowRollbackUseCase(lock, switcher, store, recorder, audit, clock, files),
  }
}
