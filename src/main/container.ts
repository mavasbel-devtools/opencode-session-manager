import { BuildAndVerifyService } from "#application/BuildAndVerifyService.ts"
import { CompactUseCase } from "#application/CompactUseCase.ts"
import { DatabaseSizesService } from "#application/DatabaseSizesService.ts"
import { GuardService } from "#application/GuardService.ts"
import { PreflightUseCase } from "#application/PreflightUseCase.ts"
import { RehearseUseCase } from "#application/RehearseUseCase.ts"
import { RollbackUseCase } from "#application/RollbackUseCase.ts"
import { SwapService } from "#application/SwapService.ts"
import { joinPath } from "#domain/model/Paths.ts"
import type { FileSystemPort } from "#domain/ports/outbound/FileSystemPort.ts"
import type { OutputPort } from "#domain/ports/outbound/OutputPort.ts"
import type { ProcessListPort } from "#domain/ports/outbound/ProcessListPort.ts"
import type { ReportSinkPort } from "#domain/ports/outbound/ReportSinkPort.ts"
import type { RuntimePort } from "#domain/ports/outbound/RuntimePort.ts"
import type { SqlitePort } from "#domain/ports/outbound/SqlitePort.ts"
import { FingerprintComparer } from "#domain/services/FingerprintComparer.ts"
import { ParityPolicy } from "#domain/services/ParityPolicy.ts"
import { RequiredSpacePolicy } from "#domain/services/RequiredSpacePolicy.ts"
import { CompactCliAdapter, type CliEnvironment } from "#infrastructure/adapters/inbound/cli/CompactCliAdapter.ts"
import { ConsoleOutputAdapter } from "#infrastructure/adapters/outbound/ConsoleOutputAdapter.ts"
import { JsonReportAdapter } from "#infrastructure/adapters/outbound/JsonReportAdapter.ts"
import { NodeFileSystemAdapter } from "#infrastructure/adapters/outbound/NodeFileSystemAdapter.ts"
import { NodeSqliteAdapter } from "#infrastructure/adapters/outbound/NodeSqliteAdapter.ts"
import { SystemClockAdapter } from "#infrastructure/adapters/outbound/SystemClockAdapter.ts"
import { TasklistAdapter } from "#infrastructure/adapters/outbound/TasklistAdapter.ts"

/** Outbound adapters a test may replace. Everything else is wired here and nowhere else. */
export interface ContainerOverrides {
  readonly sqlite?: SqlitePort
  readonly fileSystem?: FileSystemPort
  readonly processes?: ProcessListPort
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
  const processes = overrides.processes ?? new TasklistAdapter()
  const output = overrides.output ?? new ConsoleOutputAdapter()
  const reports = overrides.reports ?? new JsonReportAdapter()
  const sqlite = overrides.sqlite ?? new NodeSqliteAdapter()

  const sizes = new DatabaseSizesService(fileSystem)
  const guard = new GuardService(fileSystem, processes, runtime)
  const swapper = new SwapService(fileSystem)
  const buildAndVerify = new BuildAndVerifyService(
    sqlite,
    fileSystem,
    runtime,
    new FingerprintComparer(),
    new ParityPolicy(),
  )

  return new CompactCliAdapter({
    preflight: new PreflightUseCase(sqlite, fileSystem, processes, sizes),
    rehearse: new RehearseUseCase(buildAndVerify, sizes, sqlite, fileSystem, reports, runtime),
    compact: new CompactUseCase(
      buildAndVerify,
      guard,
      swapper,
      sizes,
      overrides.space ?? new RequiredSpacePolicy(),
      sqlite,
      fileSystem,
      reports,
      runtime,
    ),
    rollback: new RollbackUseCase(fileSystem, processes, guard, runtime),
    output,
    runtime,
    environment,
    image: environment.OPENCODE_DB_COMPACT_IMAGE ?? "opencode.exe",
    rehearsalDirectory:
      environment.OPENCODE_DB_COMPACT_REHEARSAL_DIR ??
      joinPath(runtime.temporaryDirectory(), "opencode", "compact-rehearsal"),
  })
}
