import type { GuardService } from "@session-manager/application/GuardService"
import type { MagicContextSyncService } from "@session-manager/application/MagicContextSyncService"
import type { StoreLockService } from "@session-manager/application/StoreLockService"
import type { SwapService } from "@session-manager/application/SwapService"
import { BusySessionsError } from "@session-manager/domain/errors/BusySessionsError"
import { DatabaseNotFoundError } from "@session-manager/domain/errors/DatabaseNotFoundError"
import { SyncVerificationError } from "@session-manager/domain/errors/SyncVerificationError"
import { dirName, joinPath } from "@session-manager/domain/model/DatabasePaths"
import { failedChecks, type SyncInput, type SyncReport } from "@session-manager/domain/model/MagicContextSync"
import type { StaleLock } from "@session-manager/domain/model/StoreLock"
import type { SyncMagicContextPort } from "@session-manager/domain/ports/inbound/SyncMagicContextPort"
import type { MaintenanceFileSystemPort } from "@session-manager/domain/ports/outbound/MaintenanceFileSystemPort"
import type { RuntimePort } from "@session-manager/domain/ports/outbound/RuntimePort"

export interface SyncMagicContextDependencies {
  readonly builder: MagicContextSyncService
  readonly guard: GuardService
  readonly locks: StoreLockService
  readonly swap: SwapService
  readonly fileSystem: MaintenanceFileSystemPort
  readonly runtime: RuntimePort
}

/** The two stores of one side a sync reads. */
interface Sides {
  readonly context: string
  readonly opencode: string
}

/**
 * Copies sessions' Magic Context state from a source profile to a target profile, for sessions both
 * profiles hold under the same id (`MagicContextSyncService` builds and checks the working copy).
 * The checked copy replaces the target store by renames, the original kept in a backup folder
 * (undone with `rollback <backupDir> --db <context.db>`).
 */
export class SyncMagicContextUseCase implements SyncMagicContextPort {
  private readonly deps: SyncMagicContextDependencies

  constructor(deps: SyncMagicContextDependencies) {
    this.deps = deps
  }

  sync(input: SyncInput): SyncReport {
    const { fileSystem } = this.deps
    const source = { context: input.source.readableContextDb ?? input.source.contextDb, opencode: input.source.readableOpencodeDb ?? input.source.opencodeDb }
    const target = { context: input.target.readableContextDb ?? input.target.contextDb, opencode: input.target.readableOpencodeDb ?? input.target.opencodeDb }
    for (const path of [source.context, source.opencode, target.context, target.opencode])
      if (!fileSystem.exists(path)) throw new DatabaseNotFoundError(path)
    if (input.dryRun) return this.run(input, source, target, [])
    this.deps.guard.assertNotHeld(input.target.contextDb)
    return this.deps.locks.hold([input.target.contextDb], "context sync", (cleared) => this.run(input, source, target, cleared))
  }

  private run(input: SyncInput, source: Sides, target: Sides, cleared: readonly StaleLock[]): SyncReport {
    const { fileSystem, runtime } = this.deps
    const work = joinPath(runtime.temporaryDirectory(), "opencode", `context-sync-${runtime.stamp()}`)
    fileSystem.mkdirp(work)
    try {
      const built = this.deps.builder.build({
        sourceContextDb: input.source.contextDb,
        readableSourceContextDb: source.context,
        targetContextDb: input.target.contextDb,
        readableTargetContextDb: target.context,
        sourceOpencodeDb: source.opencode,
        targetOpencodeDb: target.opencode,
        sessions: input.sessions,
        scope: input.scope,
        workDir: work,
      })
      const failed = failedChecks(built.checks)
      if (failed.length > 0) throw new SyncVerificationError(failed)
      const busy = built.sessions.filter((outcome) => outcome.reason === "busy").map((outcome) => outcome.id)
      if (input.strict === true && busy.length > 0) throw new BusySessionsError(busy)
      const backupDir = input.dryRun || !built.changed ? null : this.replace(input.target.contextDb, built.workTarget)
      return {
        source_context_db: input.source.contextDb,
        target_context_db: input.target.contextDb,
        format: built.format,
        dry_run: input.dryRun,
        scope: input.scope,
        sessions: built.sessions,
        projects: built.projects,
        user_memories_copied: built.user_memories_copied,
        checks: built.checks,
        backup_dir: backupDir,
        stale_locks_cleared: cleared,
      }
    } finally {
      fileSystem.removeTree(work)
    }
  }

  /** Puts the verified copy in place by renames, next to the target first (it may be on another file system). */
  private replace(targetContextDb: string, workTarget: string): string {
    const { fileSystem, runtime } = this.deps
    this.deps.guard.assertNotHeld(targetContextDb)
    const stamp = runtime.stamp()
    const incoming = `${targetContextDb}.incoming-${stamp}`
    const backupDir = joinPath(dirName(targetContextDb), `context-sync-backup-${stamp}`)
    fileSystem.copyFile(workTarget, incoming)
    try {
      this.deps.swap.swap({ dbPath: targetContextDb, compacted: incoming, backupDir })
    } catch (error) {
      fileSystem.remove(incoming)
      throw error
    }
    return backupDir
  }
}
