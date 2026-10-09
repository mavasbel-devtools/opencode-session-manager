import type { CopyMagicContextPort } from "@session-manager/domain/ports/inbound/CopyMagicContextPort"
import type { GuardService } from "@session-manager/application/GuardService"
import type { SwapService } from "@session-manager/application/SwapService"
import { DatabaseNotFoundError } from "@session-manager/domain/errors/DatabaseNotFoundError"
import { MagicContextFormatMismatchError } from "@session-manager/domain/errors/MagicContextFormatMismatchError"
import { SyncVerificationError } from "@session-manager/domain/errors/SyncVerificationError"
import { dirName, joinPath } from "@session-manager/domain/model/DatabasePaths"
import {
  harnessFor,
  relationOf,
  type SessionOutcome,
  type SkipReason,
  type SyncChecks,
  type SyncInput,
  type SyncReport,
} from "@session-manager/domain/model/MagicContextSync"
import type { PathMapping } from "@session-manager/domain/model/Migration"
import { hasContextState } from "@session-manager/domain/model/SessionCatalog"
import type { SyncMagicContextPort } from "@session-manager/domain/ports/inbound/SyncMagicContextPort"
import type { MagicContextIdentityPort } from "@session-manager/domain/ports/outbound/MagicContextIdentityPort"
import type { MagicContextStorePort } from "@session-manager/domain/ports/outbound/MagicContextStorePort"
import type { MagicContextSyncStorePort, PlannedCopy } from "@session-manager/domain/ports/outbound/MagicContextSyncStorePort"
import type { MaintenanceFileSystemPort } from "@session-manager/domain/ports/outbound/MaintenanceFileSystemPort"
import type { RuntimePort } from "@session-manager/domain/ports/outbound/RuntimePort"
import type { SessionStorePort } from "@session-manager/domain/ports/outbound/SessionStorePort"
import type { SqlitePort } from "@session-manager/domain/ports/outbound/SqlitePort"
import type { TextRewriter } from "@session-manager/domain/services/PathRewriter"
import { inferWindowsMapping } from "@session-manager/domain/services/WindowsMapping"

export interface SyncMagicContextDependencies {
  readonly sqlite: SqlitePort
  readonly sessions: SessionStorePort
  readonly contexts: MagicContextStorePort
  readonly syncStore: MagicContextSyncStorePort
  readonly identity: MagicContextIdentityPort
  readonly copier: CopyMagicContextPort
  readonly guard: GuardService
  readonly swap: SwapService
  readonly fileSystem: MaintenanceFileSystemPort
  readonly runtime: RuntimePort
  readonly rewriterFor: (mapping: PathMapping) => TextRewriter
}

/**
 * Copies sessions' Magic Context state from a source profile to a target profile, for sessions both
 * profiles hold under the same id. Works on copies only: the source store is read through
 * `VACUUM INTO`, brought to the target's format by the installed Magic Context when it is older, and
 * the target is rebuilt in a working copy that must pass its checks before it replaces the target by
 * renames, the original kept in a backup folder (undone with `rollback <backupDir> --db <context.db>`).
 *
 * A session is copied only when the target's message history holds every message the source's
 * summaries point at, in the same order: the source's history must be the target's or a beginning
 * of it. A session the target already has state for is replaced only when asked to.
 */
export class SyncMagicContextUseCase implements SyncMagicContextPort {
  private readonly deps: SyncMagicContextDependencies

  constructor(deps: SyncMagicContextDependencies) {
    this.deps = deps
  }

  sync(input: SyncInput): SyncReport {
    const { fileSystem, runtime, sqlite, contexts, syncStore } = this.deps
    const source = { context: input.source.readableContextDb ?? input.source.contextDb, opencode: input.source.readableOpencodeDb ?? input.source.opencodeDb }
    const target = { context: input.target.readableContextDb ?? input.target.contextDb, opencode: input.target.readableOpencodeDb ?? input.target.opencodeDb }
    for (const path of [source.context, source.opencode, target.context, target.opencode])
      if (!fileSystem.exists(path)) throw new DatabaseNotFoundError(path)
    if (!input.dryRun) this.deps.guard.assertNotHeld(input.target.contextDb)

    const sourceFormat = contexts.formatVersion(source.context) ?? 0
    const targetFormat = contexts.formatVersion(target.context) ?? 0
    if (sourceFormat > targetFormat)
      throw new MagicContextFormatMismatchError(input.source.contextDb, sourceFormat, input.target.contextDb, targetFormat)

    const work = joinPath(runtime.temporaryDirectory(), "opencode", `context-sync-${runtime.stamp()}`)
    fileSystem.mkdirp(work)
    try {
      const workSource = joinPath(work, "source.db")
      const workTarget = joinPath(work, "target.db")
      if (sourceFormat < targetFormat) {
        const upgraded = this.deps.copier.copy({ source: source.context, target: workSource })
        if (upgraded.to_format !== targetFormat)
          throw new MagicContextFormatMismatchError(input.source.contextDb, upgraded.to_format, input.target.contextDb, targetFormat)
      } else sqlite.vacuumInto(source.context, workSource)
      sqlite.vacuumInto(target.context, workTarget)

      const { planned, outcomes, targetIds } = this.plan(input, source.opencode, target.opencode, workSource, workTarget)
      const results = new Map(syncStore.copySessions(workSource, workTarget, planned).map((result) => [result.id, result]))
      const checks = this.verify(workTarget, planned, results, targetIds)
      const failed = Object.entries(checks)
        .filter(([, ok]) => !ok)
        .map(([name]) => name)
      if (failed.length > 0) throw new SyncVerificationError(failed)

      const sessions = outcomes.map((outcome): SessionOutcome => {
        const result = results.get(outcome.id)
        if (result === undefined) return outcome
        const { id: _id, residual_windows_paths, ...counts } = result
        return { ...outcome, status: "copied", counts, residual_windows_paths }
      })
      const backupDir = input.dryRun || planned.length === 0 ? null : this.replace(input.target.contextDb, workTarget)
      return {
        source_context_db: input.source.contextDb,
        target_context_db: input.target.contextDb,
        format: targetFormat,
        dry_run: input.dryRun,
        sessions,
        checks,
        backup_dir: backupDir,
      }
    } finally {
      fileSystem.removeTree(work)
    }
  }

  private plan(input: SyncInput, sourceOpencode: string, targetOpencode: string, workSource: string, workTarget: string) {
    const { sessions, syncStore, identity, runtime, contexts } = this.deps
    const byId = (path: string) => new Map(sessions.sessions(path).map((session) => [session.id, session]))
    const sourceSessions = byId(sourceOpencode)
    const targetSessions = byId(targetOpencode)
    const targetState = contexts.summary(workTarget).sessions
    const planned: PlannedCopy[] = []
    const outcomes: SessionOutcome[] = []
    const targetIds = new Map<string, ReadonlySet<string>>()
    const skip = (id: string, reason: SkipReason, relation: SessionOutcome["relation"] = null) =>
      outcomes.push({ id, status: "skipped", reason, relation, counts: null, residual_windows_paths: 0 })

    const requests = [...new Map(input.sessions.map((request) => [request.id, request])).values()]
    for (const request of requests) {
      const from = sourceSessions.get(request.id)
      const to = targetSessions.get(request.id)
      if (from === undefined) skip(request.id, "not-on-source")
      else if (to === undefined) skip(request.id, "not-on-target")
      else if (request.resolution === "skip" && hasContextState(targetState[request.id])) skip(request.id, "resolution-skip")
      else {
        const state = syncStore.sourceState(workSource, request.id)
        const fromIds = sessions.messageIds(sourceOpencode, request.id, from.generation)
        const toIds = sessions.messageIds(targetOpencode, request.id, to.generation)
        const relation = relationOf(fromIds, toIds)
        const toSet = new Set(toIds)
        const project = syncStore.recordedProject(workTarget, request.id) ?? identity.identityOf(to.directory) ?? gitOnly(state.project)
        if (state.harness === null) skip(request.id, "no-state", relation)
        else if (relation === "source-ahead" || relation === "diverged") skip(request.id, relation, relation)
        else if (!state.anchors.every((anchor) => toSet.has(anchor))) skip(request.id, "stale-anchors", relation)
        else if (project === null) skip(request.id, "no-project", relation)
        else {
          const mapping = inferWindowsMapping(from.directory, to.directory, runtime.homeDirectory())
          planned.push({
            copy: { id: request.id, sourceHarness: state.harness, targetHarness: harnessFor(to.generation), targetProject: project, sourceProject: state.project },
            rewriter: mapping === null ? null : this.deps.rewriterFor(mapping),
          })
          targetIds.set(request.id, toSet)
          outcomes.push({ id: request.id, status: "skipped", reason: null, relation, counts: null, residual_windows_paths: 0 })
        }
      }
    }
    return { planned, outcomes, targetIds }
  }

  private verify(
    workTarget: string,
    planned: readonly PlannedCopy[],
    results: ReadonlyMap<string, { readonly compartments: number; readonly tags: number; readonly notes: number }>,
    targetIds: ReadonlyMap<string, ReadonlySet<string>>,
  ): SyncChecks {
    const health = this.deps.syncStore.health(workTarget)
    let anchors = true
    let counts = true
    for (const { copy } of planned) {
      const stored = this.deps.syncStore.stateOf(workTarget, copy.id)
      const result = results.get(copy.id)
      if (result === undefined || stored.compartments !== result.compartments || stored.tags !== result.tags || stored.notes !== result.notes)
        counts = false
      if (!stored.anchors.every((anchor) => targetIds.get(copy.id)!.has(anchor))) anchors = false
    }
    return { integrity_ok: health.integrity_ok, foreign_keys_ok: health.foreign_keys_ok, anchors_ok: anchors, counts_ok: counts }
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

/** A git identity is the same on every machine; a folder identity is not. */
function gitOnly(project: string | null): string | null {
  return project !== null && project.startsWith("git:") ? project : null
}

