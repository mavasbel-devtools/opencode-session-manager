import { ApplyQueueUseCase } from "@session-manager/application/ApplyQueueUseCase"
import type { BrowserControls } from "@session-manager/infrastructure/adapters/inbound/manager-tui/controls"
import { MagicContextSyncService } from "@session-manager/application/MagicContextSyncService"
import { SyncMagicContextUseCase } from "@session-manager/application/SyncMagicContextUseCase"
import { SyncSessionsUseCase } from "@session-manager/application/SyncSessionsUseCase"
import { VerifyProfileUseCase } from "@session-manager/application/VerifyProfileUseCase"
import { MagicContextVersionsUseCase } from "@session-manager/application/MagicContextVersionsUseCase"
import { MAGIC_CONTEXT_PACKAGE } from "@session-manager/domain/services/Jsonc"
import { OpencodeMagicContextConfigAdapter } from "@session-manager/infrastructure/adapters/outbound/magic-context/OpencodeMagicContextConfigAdapter"
import { NpmRegistryAdapter } from "@session-manager/infrastructure/adapters/outbound/npm/NpmRegistryAdapter"
import { VerifyCliAdapter } from "@session-manager/infrastructure/adapters/inbound/cli/VerifyCliAdapter"
import type { SessionSyncStorePort } from "@session-manager/domain/ports/outbound/SessionSyncStorePort"
import { SyncCliAdapter } from "@session-manager/infrastructure/adapters/inbound/cli/SyncCliAdapter"
import { BunSessionSyncStoreAdapter } from "@session-manager/infrastructure/adapters/outbound/sqlite/BunSessionSyncStoreAdapter"
import type { MagicContextIdentityPort } from "@session-manager/domain/ports/outbound/MagicContextIdentityPort"
import type { MagicContextSyncStorePort } from "@session-manager/domain/ports/outbound/MagicContextSyncStorePort"
import { MagicContextIdentityAdapter } from "@session-manager/infrastructure/adapters/outbound/magic-context/MagicContextIdentityAdapter"
import { BunMagicContextSyncStoreAdapter } from "@session-manager/infrastructure/adapters/outbound/sqlite/BunMagicContextSyncStoreAdapter"
import packageJson from "@package-json" with { type: "json" }
import { HelpCliAdapter } from "@session-manager/infrastructure/adapters/inbound/cli/HelpCliAdapter"
import { OpenProfileUseCase } from "@session-manager/application/OpenProfileUseCase"
import type { BrowserState } from "@session-manager/domain/model/Browser"
import { BrowseCliAdapter } from "@session-manager/infrastructure/adapters/inbound/cli/BrowseCliAdapter"
import { showBrowser, terminalRenderer } from "@session-manager/infrastructure/adapters/inbound/manager-tui/OpenTuiBrowser"
import { CopyMagicContextUseCase } from "@session-manager/application/CopyMagicContextUseCase"
import type { MagicContextReleasePort } from "@session-manager/domain/ports/outbound/MagicContextReleasePort"
import { ContextCliAdapter } from "@session-manager/infrastructure/adapters/inbound/cli/ContextCliAdapter"
import { InstalledMagicContextAdapter } from "@session-manager/infrastructure/adapters/outbound/magic-context/InstalledMagicContextAdapter"
import { CatalogProfileUseCase } from "@session-manager/application/CatalogProfileUseCase"
import type { MagicContextStorePort } from "@session-manager/domain/ports/outbound/MagicContextStorePort"
import type { SessionStorePort } from "@session-manager/domain/ports/outbound/SessionStorePort"
import { SessionsCliAdapter } from "@session-manager/infrastructure/adapters/inbound/cli/SessionsCliAdapter"
import { BunMagicContextStoreAdapter } from "@session-manager/infrastructure/adapters/outbound/sqlite/BunMagicContextStoreAdapter"
import { BunSessionStoreAdapter } from "@session-manager/infrastructure/adapters/outbound/sqlite/BunSessionStoreAdapter"
import { BuildAndVerifyService } from "@session-manager/application/BuildAndVerifyService"
import { CompactUseCase } from "@session-manager/application/CompactUseCase"
import { DatabaseSizesService } from "@session-manager/application/DatabaseSizesService"
import { GuardService } from "@session-manager/application/GuardService"
import { StoreLockService } from "@session-manager/application/StoreLockService"
import type { StoreLockPort } from "@session-manager/domain/ports/outbound/StoreLockPort"
import { FsStoreLockAdapter } from "@session-manager/infrastructure/adapters/outbound/fs/FsStoreLockAdapter"
import { PreflightUseCase } from "@session-manager/application/PreflightUseCase"
import { RehearseUseCase } from "@session-manager/application/RehearseUseCase"
import { RollbackUseCase } from "@session-manager/application/RollbackUseCase"
import { SwapService } from "@session-manager/application/SwapService"
import { joinPath } from "@session-manager/domain/model/DatabasePaths"
import type { MaintenanceFileSystemPort } from "@session-manager/domain/ports/outbound/MaintenanceFileSystemPort"
import type { OutputPort } from "@session-manager/domain/ports/outbound/OutputPort"
import type { DatabaseHoldersPort } from "@session-manager/domain/ports/outbound/DatabaseHoldersPort"
import type { ProcessListPort } from "@session-manager/domain/ports/outbound/ProcessListPort"
import type { ProjectIdentityPort } from "@session-manager/domain/ports/outbound/ProjectIdentityPort"
import type { ReportSinkPort } from "@session-manager/domain/ports/outbound/ReportSinkPort"
import type { RuntimePort } from "@session-manager/domain/ports/outbound/RuntimePort"
import type { SqlitePort } from "@session-manager/domain/ports/outbound/SqlitePort"
import { FingerprintComparer } from "@session-manager/domain/services/FingerprintComparer"
import { ParityPolicy } from "@session-manager/domain/services/ParityPolicy"
import type { PathMapping } from "@session-manager/domain/model/PathMapping"
import { PathRewriter, type TextRewriter } from "@session-manager/domain/services/PathRewriter"
import { RequiredSpacePolicy } from "@session-manager/domain/services/RequiredSpacePolicy"
import { CliRouter } from "@session-manager/infrastructure/adapters/inbound/cli/CliRouter"
import { CompactCliAdapter, type CliEnvironment } from "@session-manager/infrastructure/adapters/inbound/cli/CompactCliAdapter"
import { ConsoleOutputAdapter } from "@session-manager/infrastructure/adapters/outbound/system/ConsoleOutputAdapter"
import { GitProjectIdentityAdapter } from "@session-manager/infrastructure/adapters/outbound/project/GitProjectIdentityAdapter"
import { JsonReportAdapter } from "@session-manager/infrastructure/adapters/outbound/fs/JsonReportAdapter"
import { NodeMaintenanceFileSystemAdapter } from "@session-manager/infrastructure/adapters/outbound/fs/NodeMaintenanceFileSystemAdapter"
import { BunSqliteAdapter } from "@session-manager/infrastructure/adapters/outbound/sqlite/BunSqliteAdapter"
import { SystemClockAdapter } from "@session-manager/infrastructure/adapters/outbound/system/SystemClockAdapter"
import { platformAdapters } from "@session-manager/main/cli/platform"

/** The rewriter for one sync's path mapping. */
export function rewriterFor(mapping: PathMapping): TextRewriter {
  return new PathRewriter(mapping)
}

/** Outbound adapters a test may replace. Everything else is wired here and nowhere else. */
export interface ContainerOverrides {
  readonly sqlite?: SqlitePort
  readonly fileSystem?: MaintenanceFileSystemPort
  readonly processes?: ProcessListPort
  readonly holders?: DatabaseHoldersPort
  readonly identity?: ProjectIdentityPort
  readonly sessionStore?: SessionStorePort
  readonly magicContextStore?: MagicContextStorePort
  readonly magicContextRelease?: MagicContextReleasePort
  readonly magicContextSyncStore?: MagicContextSyncStorePort
  readonly magicContextIdentity?: MagicContextIdentityPort
  readonly sessionSyncStore?: SessionSyncStorePort
  readonly storeLock?: StoreLockPort
  /** Shows the session browser; the default paints it on this terminal. */
  readonly show?: (initial: BrowserState, controls: BrowserControls) => Promise<void>
  readonly runtime?: RuntimePort
  readonly reports?: ReportSinkPort
  readonly output?: OutputPort
  /** A policy demanding more space than a test machine has, so the real disk guard can be exercised. */
  readonly space?: RequiredSpacePolicy
}

export interface Cli {
  run(argv: readonly string[]): number | Promise<number>
}

/** The single composition root: the one place that constructs adapters and use cases. */
export async function buildContainer(environment: CliEnvironment, overrides: ContainerOverrides = {}): Promise<Cli> {
  const runtime = overrides.runtime ?? new SystemClockAdapter()
  const fileSystem = overrides.fileSystem ?? new NodeMaintenanceFileSystemAdapter()
  const platform = await platformAdapters(runtime.platform(), fileSystem, runtime.pid())
  const processes = overrides.processes ?? platform.processes
  const holders = overrides.holders ?? platform.holders
  const output = overrides.output ?? new ConsoleOutputAdapter()
  const reports = overrides.reports ?? new JsonReportAdapter()
  const sqlite = overrides.sqlite ?? new BunSqliteAdapter()
  const identity = overrides.identity ?? new GitProjectIdentityAdapter()
  const sessionStore = overrides.sessionStore ?? new BunSessionStoreAdapter()
  const magicContextStore = overrides.magicContextStore ?? new BunMagicContextStoreAdapter()
  const space = overrides.space ?? new RequiredSpacePolicy()

  const sizes = new DatabaseSizesService(fileSystem)
  const guard = new GuardService(fileSystem, processes, holders)
  const locks = new StoreLockService(overrides.storeLock ?? new FsStoreLockAdapter(), runtime)
  const swapper = new SwapService(fileSystem)
  const buildAndVerify = new BuildAndVerifyService(
    sqlite,
    fileSystem,
    runtime,
    new FingerprintComparer(),
    new ParityPolicy(),
  )

  const image = environment.OPENCODE_DB_COMPACT_IMAGE ?? platform.image
  const compactCli = new CompactCliAdapter({
    preflight: new PreflightUseCase(sqlite, fileSystem, processes, sizes),
    rehearse: new RehearseUseCase(buildAndVerify, sizes, sqlite, fileSystem, reports, runtime),
    compact: new CompactUseCase(
      buildAndVerify,
      guard,
      swapper,
      sizes,
      space,
      sqlite,
      fileSystem,
      reports,
      runtime,
      locks,
    ),
    rollback: new RollbackUseCase(fileSystem, processes, guard, runtime, locks),
    output,
    runtime,
    environment,
    image,
    rehearsalDirectory:
      environment.OPENCODE_DB_COMPACT_REHEARSAL_DIR ??
      joinPath(runtime.temporaryDirectory(), "opencode", "compact-rehearsal"),
  })

  const profiles = new OpenProfileUseCase(new CatalogProfileUseCase(sessionStore, magicContextStore, fileSystem), fileSystem, runtime)
  const sessionsCli = new SessionsCliAdapter({
    profiles,
    output,
    runtime,
    environment,
  })

  const magicContextRelease =
    overrides.magicContextRelease ??
    new InstalledMagicContextAdapter(
      [joinPath(environment.XDG_CACHE_HOME || joinPath(runtime.homeDirectory(), ".cache"), "opencode")],
      environment.OPENCODE_SESSION_MANAGER_MAGIC_CONTEXT || undefined,
      process.execPath,
      runtime.temporaryDirectory(),
    )
  const copier = new CopyMagicContextUseCase(sqlite, magicContextStore, magicContextRelease, fileSystem)
  const contextSyncStore = overrides.magicContextSyncStore ?? new BunMagicContextSyncStoreAdapter()
  const contextIdentity = overrides.magicContextIdentity ?? new MagicContextIdentityAdapter()
  const sessionSyncStore = overrides.sessionSyncStore ?? new BunSessionSyncStoreAdapter()
  const contextBuilder = new MagicContextSyncService({
    sqlite,
    sessions: sessionStore,
    contexts: magicContextStore,
    syncStore: contextSyncStore,
    identity: contextIdentity,
    copier,
    runtime,
    rewriterFor,
  })
  const syncContext = new SyncMagicContextUseCase({ builder: contextBuilder, guard, locks, swap: swapper, fileSystem, runtime })
  const contextCli = new ContextCliAdapter({
    copy: copier,
    sync: syncContext,
    profiles,
    output,
  })

  const syncSessions = new SyncSessionsUseCase({
    sqlite,
    sessions: sessionStore,
    store: sessionSyncStore,
    identity,
    contexts: contextBuilder,
    guard,
    locks,
    swap: swapper,
    fileSystem,
    runtime,
    rewriterFor,
  })
  const syncCli = new SyncCliAdapter({
    sync: syncSessions,
    profiles,
    output,
  })

  const verifyProfile = new VerifyProfileUseCase({
    sessions: sessionStore,
    opencodeStore: sessionSyncStore,
    contexts: magicContextStore,
    contextStore: contextSyncStore,
    identity,
    contextIdentity,
    fileSystem,
    runtime,
  })
  const verifyCli = new VerifyCliAdapter({
    verify: verifyProfile,
    profiles,
    output,
    runtime,
    environment,
  })

  const browseCli = new BrowseCliAdapter({
    profiles,
    output,
    runtime,
    environment,
    apply: new ApplyQueueUseCase(syncSessions, profiles),
    verify: verifyProfile,
    versions: new MagicContextVersionsUseCase(
      new OpencodeMagicContextConfigAdapter(
        joinPath(environment.XDG_CONFIG_HOME || joinPath(runtime.homeDirectory(), ".config"), "opencode"),
        joinPath(environment.XDG_CACHE_HOME || joinPath(runtime.homeDirectory(), ".cache"), "opencode"),
      ),
      environment.OPENCODE_SESSION_MANAGER_OFFLINE
        ? null
        : new NpmRegistryAdapter(environment.OPENCODE_SESSION_MANAGER_NPM_REGISTRY || "https://registry.npmjs.org", MAGIC_CONTEXT_PACKAGE, 5000),
    ),
    show: overrides.show ?? showBrowser(terminalRenderer),
  })

  const helpCli = new HelpCliAdapter(output, packageJson.version)
  const help = { run: (argv: readonly string[]) => helpCli.run(argv, "help") }
  const version = { run: (argv: readonly string[]) => helpCli.run(argv, "version") }

  return new CliRouter(compactCli, { sync: syncCli, verify: verifyCli, sessions: sessionsCli, context: contextCli, tui: browseCli, help, "--help": help, "-h": help, version, "--version": version })
}
