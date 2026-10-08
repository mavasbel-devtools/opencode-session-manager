import { BuildAndVerifyService } from "#application/BuildAndVerifyService.ts"
import { CompactUseCase } from "#application/CompactUseCase.ts"
import { DatabaseSizesService } from "#application/DatabaseSizesService.ts"
import { GuardService } from "#application/GuardService.ts"
import { MigrateUseCase } from "#application/MigrateUseCase.ts"
import { MigrationVerifier } from "#application/MigrationVerifier.ts"
import { PreflightUseCase } from "#application/PreflightUseCase.ts"
import { RehearseUseCase } from "#application/RehearseUseCase.ts"
import { RekeyService } from "#application/RekeyService.ts"
import { RewriteService } from "#application/RewriteService.ts"
import { RollbackUseCase } from "#application/RollbackUseCase.ts"
import { SwapService } from "#application/SwapService.ts"
import { joinPath } from "#domain/model/Paths.ts"
import type { FileSystemPort } from "#domain/ports/outbound/FileSystemPort.ts"
import type { MigrationStorePort } from "#domain/ports/outbound/MigrationStorePort.ts"
import type { OutputPort } from "#domain/ports/outbound/OutputPort.ts"
import type { DatabaseHoldersPort } from "#domain/ports/outbound/DatabaseHoldersPort.ts"
import type { ProcessListPort } from "#domain/ports/outbound/ProcessListPort.ts"
import type { ProjectIdentityPort } from "#domain/ports/outbound/ProjectIdentityPort.ts"
import type { ReportSinkPort } from "#domain/ports/outbound/ReportSinkPort.ts"
import type { RuntimePort } from "#domain/ports/outbound/RuntimePort.ts"
import type { SqlitePort } from "#domain/ports/outbound/SqlitePort.ts"
import { FingerprintComparer } from "#domain/services/FingerprintComparer.ts"
import { ParityPolicy } from "#domain/services/ParityPolicy.ts"
import { RequiredSpacePolicy } from "#domain/services/RequiredSpacePolicy.ts"
import { CliRouter } from "#infrastructure/adapters/inbound/cli/CliRouter.ts"
import { CompactCliAdapter, type CliEnvironment } from "#infrastructure/adapters/inbound/cli/CompactCliAdapter.ts"
import { MigrateCliAdapter } from "#infrastructure/adapters/inbound/cli/MigrateCliAdapter.ts"
import { ConsoleOutputAdapter } from "#infrastructure/adapters/outbound/ConsoleOutputAdapter.ts"
import { GitProjectIdentityAdapter } from "#infrastructure/adapters/outbound/GitProjectIdentityAdapter.ts"
import { JsonReportAdapter } from "#infrastructure/adapters/outbound/JsonReportAdapter.ts"
import { NodeFileSystemAdapter } from "#infrastructure/adapters/outbound/NodeFileSystemAdapter.ts"
import { NodeMigrationStoreAdapter } from "#infrastructure/adapters/outbound/NodeMigrationStoreAdapter.ts"
import { NodeSqliteAdapter } from "#infrastructure/adapters/outbound/NodeSqliteAdapter.ts"
import { SystemClockAdapter } from "#infrastructure/adapters/outbound/SystemClockAdapter.ts"
import { platformAdapters } from "#main/platform.ts"

/** Outbound adapters a test may replace. Everything else is wired here and nowhere else. */
export interface ContainerOverrides {
  readonly sqlite?: SqlitePort
  readonly fileSystem?: FileSystemPort
  readonly processes?: ProcessListPort
  readonly holders?: DatabaseHoldersPort
  readonly identity?: ProjectIdentityPort
  readonly store?: MigrationStorePort
  readonly runtime?: RuntimePort
  readonly reports?: ReportSinkPort
  readonly output?: OutputPort
  /** A policy demanding more space than a test machine has, so the real disk guard can be exercised. */
  readonly space?: RequiredSpacePolicy
}

export interface Cli {
  run(argv: readonly string[]): number
}

/** The single composition root: the one place that constructs adapters and use cases. */
export function buildContainer(environment: CliEnvironment, overrides: ContainerOverrides = {}): Cli {
  const runtime = overrides.runtime ?? new SystemClockAdapter()
  const fileSystem = overrides.fileSystem ?? new NodeFileSystemAdapter()
  const platform = platformAdapters(runtime.platform(), fileSystem, runtime.pid())
  const processes = overrides.processes ?? platform.processes
  const holders = overrides.holders ?? platform.holders
  const output = overrides.output ?? new ConsoleOutputAdapter()
  const reports = overrides.reports ?? new JsonReportAdapter()
  const sqlite = overrides.sqlite ?? new NodeSqliteAdapter()
  const identity = overrides.identity ?? new GitProjectIdentityAdapter()
  const store = overrides.store ?? new NodeMigrationStoreAdapter()
  const space = overrides.space ?? new RequiredSpacePolicy()

  const sizes = new DatabaseSizesService(fileSystem)
  const guard = new GuardService(fileSystem, processes, holders)
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
    ),
    rollback: new RollbackUseCase(fileSystem, processes, guard, runtime),
    output,
    runtime,
    environment,
    image,
    rehearsalDirectory:
      environment.OPENCODE_DB_COMPACT_REHEARSAL_DIR ??
      joinPath(runtime.temporaryDirectory(), "opencode", "compact-rehearsal"),
  })

  const migrateCli = new MigrateCliAdapter({
    migrate: new MigrateUseCase({
      guard,
      swapper,
      sizes,
      space,
      rewriteService: new RewriteService(),
      rekeyService: new RekeyService(identity, runtime),
      verifier: new MigrationVerifier(sqlite, identity),
      store,
      sqlite,
      fileSystem,
      reports,
      runtime,
    }),
    output,
    runtime,
    environment,
    image,
    rehearsalDirectory:
      environment.OPENCODE_DB_MIGRATE_REHEARSAL_DIR ??
      joinPath(runtime.temporaryDirectory(), "opencode", "migrate-rehearsal"),
  })

  return new CliRouter(compactCli, migrateCli)
}
