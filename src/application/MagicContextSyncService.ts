import type { CopyMagicContextPort } from "@session-manager/domain/ports/inbound/CopyMagicContextPort"
import { MagicContextFormatMismatchError } from "@session-manager/domain/errors/MagicContextFormatMismatchError"
import { joinPath } from "@session-manager/domain/model/DatabasePaths"
import {
  harnessFor,
  relationOf,
  type ContextScope,
  type ProjectMergeResult,
  type SessionOutcome,
  type SkipReason,
  type SyncChecks,
  type SyncRequest,
} from "@session-manager/domain/model/MagicContextSync"
import type { PathMapping } from "@session-manager/domain/model/PathMapping"
import { hasContextState, type StoredSession } from "@session-manager/domain/model/SessionCatalog"
import type { MagicContextIdentityPort } from "@session-manager/domain/ports/outbound/MagicContextIdentityPort"
import type { MagicContextStorePort } from "@session-manager/domain/ports/outbound/MagicContextStorePort"
import type { MagicContextSyncStorePort, PlannedCopy, ProjectMerge } from "@session-manager/domain/ports/outbound/MagicContextSyncStorePort"
import type { RuntimePort } from "@session-manager/domain/ports/outbound/RuntimePort"
import type { SessionStorePort } from "@session-manager/domain/ports/outbound/SessionStorePort"
import type { SqlitePort } from "@session-manager/domain/ports/outbound/SqlitePort"
import type { TextRewriter } from "@session-manager/domain/services/PathRewriter"
import { inferWindowsMapping } from "@session-manager/domain/services/WindowsMapping"

export interface MagicContextSyncServiceDependencies {
  readonly sqlite: SqlitePort
  readonly sessions: SessionStorePort
  readonly contexts: MagicContextStorePort
  readonly syncStore: MagicContextSyncStorePort
  readonly identity: MagicContextIdentityPort
  readonly copier: CopyMagicContextPort
  readonly runtime: RuntimePort
  readonly rewriterFor: (mapping: PathMapping) => TextRewriter
}

export interface ContextBuildInput {
  /** The source store as named in reports, and where it can be read. */
  readonly sourceContextDb: string
  readonly readableSourceContextDb: string
  readonly targetContextDb: string
  readonly readableTargetContextDb: string
  /** OpenCode stores the sessions and their message ids are read from (the target's may be a working copy). */
  readonly sourceOpencodeDb: string
  readonly targetOpencodeDb: string
  readonly sessions: readonly SyncRequest[]
  readonly scope: ContextScope
  /** An empty folder for the working copies; the caller removes it. */
  readonly workDir: string
  /** The mapping for one session's text, when the caller knows it (default: the one its folders imply). */
  readonly mappingFor?: (source: StoredSession, target: StoredSession) => PathMapping | null
}

export interface ContextBuild {
  /** The checked working copy of the target store. */
  readonly workTarget: string
  readonly format: number
  readonly sessions: readonly SessionOutcome[]
  readonly projects: readonly ProjectMergeResult[]
  readonly user_memories_copied: number
  readonly checks: SyncChecks
  /** How many sessions the working copy received. */
  readonly copied: number
  /** Whether the working copy differs from the target at all (sessions, or project state merged). */
  readonly changed: boolean
}

/**
 * Builds a working copy of a target Magic Context store holding sessions' state from a source
 * store, and checks it. Both stores are only read (`VACUUM INTO`); a source in an older format is
 * first brought to the target's by the installed Magic Context, and a newer one is refused.
 *
 * A session is copied only when the target's message history holds every message the source's
 * summaries point at, in the same order: the source's history must be the target's or a beginning
 * of it. State the target already has is replaced as the request says.
 */
export class MagicContextSyncService {
  private readonly deps: MagicContextSyncServiceDependencies

  constructor(deps: MagicContextSyncServiceDependencies) {
    this.deps = deps
  }

  build(input: ContextBuildInput): ContextBuild {
    const { sqlite, contexts, syncStore } = this.deps
    const sourceFormat = contexts.formatVersion(input.readableSourceContextDb) ?? 0
    const targetFormat = contexts.formatVersion(input.readableTargetContextDb) ?? 0
    if (sourceFormat > targetFormat) throw new MagicContextFormatMismatchError(input.sourceContextDb, sourceFormat, input.targetContextDb, targetFormat)

    const workSource = joinPath(input.workDir, "context-source.db")
    const workTarget = joinPath(input.workDir, "context-target.db")
    if (sourceFormat < targetFormat) {
      const upgraded = this.deps.copier.copy({ source: input.readableSourceContextDb, target: workSource })
      if (upgraded.to_format !== targetFormat)
        throw new MagicContextFormatMismatchError(input.sourceContextDb, upgraded.to_format, input.targetContextDb, targetFormat)
    } else sqlite.vacuumInto(input.readableSourceContextDb, workSource)
    sqlite.vacuumInto(input.readableTargetContextDb, workTarget)

    const { planned, outcomes, targetIds, merges } = this.plan(input, workSource, workTarget)
    const projects = input.scope === "all" ? [...merges.values()] : []
    const outcome = syncStore.copySessions(workSource, workTarget, planned, {
      originatedMemories: input.scope === "sessions",
      projects,
      userMemories: projects.length > 0,
      now: this.deps.runtime.now(),
    })
    const results = new Map(outcome.sessions.map((result) => [result.id, result]))
    const checks = this.verify(workTarget, planned, results, targetIds)
    const sessions = outcomes.map((outcome): SessionOutcome => {
      const result = results.get(outcome.id)
      if (result === undefined) return outcome
      const { id: _id, residual_windows_paths, ...counts } = result
      return { ...outcome, status: "copied", counts, residual_windows_paths }
    })
    const merged = outcome.projects.some((project) => project.memories_copied + project.verifications + project.notes + project.primers + project.dream_runs + project.retrospective_windows > 0)
    return {
      workTarget,
      format: targetFormat,
      sessions,
      projects: outcome.projects,
      user_memories_copied: outcome.user_memories_copied,
      checks,
      copied: planned.length,
      changed: planned.length > 0 || merged || outcome.user_memories_copied > 0,
    }
  }

  private plan(input: ContextBuildInput, workSource: string, workTarget: string) {
    const { sessions, syncStore, identity, runtime } = this.deps
    const byId = (path: string) => new Map(sessions.sessions(path).map((session) => [session.id, session]))
    const sourceSessions = byId(input.sourceOpencodeDb)
    const targetSessions = byId(input.targetOpencodeDb)
    const targetState = this.deps.contexts.summary(workTarget).sessions
    const now = runtime.now()
    const planned: PlannedCopy[] = []
    const outcomes: SessionOutcome[] = []
    const targetIds = new Map<string, ReadonlySet<string>>()
    /** Every source project → target project the requested sessions link, for scope `all`. */
    const merges = new Map<string, ProjectMerge>()
    const skip = (id: string, reason: SkipReason, relation: SessionOutcome["relation"] = null) =>
      outcomes.push({ id, status: "skipped", reason, relation, counts: null, residual_windows_paths: 0 })

    const requests = [...new Map(input.sessions.map((request) => [request.id, request])).values()]
    for (const request of requests) {
      const from = sourceSessions.get(request.id)
      const to = targetSessions.get(request.id)
      const targetHas = hasContextState(targetState[request.id])
      if (from === undefined) skip(request.id, "not-on-source")
      else if (to === undefined) skip(request.id, "not-on-target")
      else {
        const state = syncStore.sourceState(workSource, request.id)
        const fromIds = sessions.messageIds(input.sourceOpencodeDb, request.id, from.generation)
        const toIds = sessions.messageIds(input.targetOpencodeDb, request.id, to.generation)
        const relation = relationOf(fromIds, toIds)
        const toSet = new Set(toIds)
        const project = syncStore.recordedProject(workTarget, request.id) ?? identity.identityOf(to.directory) ?? gitOnly(state.project)
        const mapping = input.mappingFor === undefined ? inferWindowsMapping(from.directory, to.directory, runtime.homeDirectory()) : input.mappingFor(from, to)
        const rewriter = mapping === null ? null : this.deps.rewriterFor(mapping)
        if (state.project !== null && project !== null && !merges.has(`${state.project}\u0000${project}`))
          merges.set(`${state.project}\u0000${project}`, { from: state.project, to: project, rewriter })
        if (request.resolution === "skip" && targetHas) skip(request.id, "resolution-skip", relation)
        else if (state.harness === null) skip(request.id, "no-state", relation)
        else if (relation === "source-ahead" || relation === "diverged") skip(request.id, relation, relation)
        else if (!state.anchors.every((anchor) => toSet.has(anchor))) skip(request.id, "stale-anchors", relation)
        else if (project === null) skip(request.id, "no-project", relation)
        else if (request.resolution === "further" && targetHas && syncStore.sourceState(workTarget, request.id).reach >= state.reach)
          skip(request.id, "target-further", relation)
        else if (syncStore.busy(input.readableTargetContextDb, request.id, now)) skip(request.id, "busy", relation)
        else if (syncStore.authorityManaged(workTarget, project)) skip(request.id, "authority-managed", relation)
        else {
          planned.push({
            copy: { id: request.id, sourceHarness: state.harness, targetHarness: harnessFor(to.generation), targetProject: project, sourceProject: state.project },
            rewriter,
          })
          targetIds.set(request.id, toSet)
          outcomes.push({ id: request.id, status: "skipped", reason: null, relation, counts: null, residual_windows_paths: 0 })
        }
      }
    }
    return { planned, outcomes, targetIds, merges }
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
}

/** A git identity is the same on every machine; a folder identity is not. */
function gitOnly(project: string | null): string | null {
  return project !== null && project.startsWith("git:") ? project : null
}
