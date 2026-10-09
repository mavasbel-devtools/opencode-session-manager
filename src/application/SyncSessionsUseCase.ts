import type { GuardService } from "@session-manager/application/GuardService"
import type { MagicContextSyncService } from "@session-manager/application/MagicContextSyncService"
import type { SwapService } from "@session-manager/application/SwapService"
import { DatabaseNotFoundError } from "@session-manager/domain/errors/DatabaseNotFoundError"
import { OpenCodeFormatMismatchError } from "@session-manager/domain/errors/OpenCodeFormatMismatchError"
import { SyncVerificationError } from "@session-manager/domain/errors/SyncVerificationError"
import { dirName, joinPath } from "@session-manager/domain/model/DatabasePaths"
import { failedChecks, relationOf, type Resolution, type SyncRequest } from "@session-manager/domain/model/MagicContextSync"
import type { PathMapping } from "@session-manager/domain/model/PathMapping"
import type { StoredSession } from "@session-manager/domain/model/SessionCatalog"
import {
  actionFor,
  type Prefer,
  type ProjectSource,
  type SessionRelation,
  type SessionSyncChecks,
  type SessionSyncInput,
  type SessionSyncOutcome,
  type SessionSyncReport,
} from "@session-manager/domain/model/SessionSync"
import type { SyncSessionsPort } from "@session-manager/domain/ports/inbound/SyncSessionsPort"
import type { MaintenanceFileSystemPort } from "@session-manager/domain/ports/outbound/MaintenanceFileSystemPort"
import type { ProjectIdentityPort } from "@session-manager/domain/ports/outbound/ProjectIdentityPort"
import type { RuntimePort } from "@session-manager/domain/ports/outbound/RuntimePort"
import type { SessionStorePort } from "@session-manager/domain/ports/outbound/SessionStorePort"
import type { ProjectPlan, SessionCopyPlan, SessionRowPlan, SessionSyncStorePort } from "@session-manager/domain/ports/outbound/SessionSyncStorePort"
import type { SqlitePort } from "@session-manager/domain/ports/outbound/SqlitePort"
import { mappingFromRules, NO_WINDOWS_PROFILE } from "@session-manager/domain/services/MapRules"
import type { TextRewriter } from "@session-manager/domain/services/PathRewriter"
import { isWithin, sessionSubpath } from "@session-manager/domain/services/PosixPaths"

export interface SyncSessionsDependencies {
  readonly sqlite: SqlitePort
  readonly sessions: SessionStorePort
  readonly store: SessionSyncStorePort
  readonly identity: ProjectIdentityPort
  readonly contexts: Pick<MagicContextSyncService, "build">
  readonly guard: GuardService
  readonly swap: SwapService
  readonly fileSystem: MaintenanceFileSystemPort
  readonly runtime: RuntimePort
  readonly rewriterFor: (mapping: PathMapping) => TextRewriter
}

/** A planned family: the root's outcome so far, and what the store adapter is asked to write. */
interface FamilyPlan {
  readonly outcome: Omit<SessionSyncOutcome, "context" | "rows_written" | "residual_windows_paths">
  readonly ids: readonly string[]
  readonly copy: SessionCopyPlan | null
  readonly mapping: PathMapping | null
}

/**
 * Syncs whole sessions from a source profile to a target profile: each session with its sub-agent
 * sessions (OpenCode rows) and their Magic Context state, matched by session id.
 *
 * Only copies are written. Both OpenCode stores are copied with `VACUUM INTO` (and both Magic
 * Context stores, by `MagicContextSyncService`); the target copies receive the sessions and must
 * pass their checks; then they replace the target stores by renames, the originals kept together in
 * one backup folder that a single `rollback` restores. A session the target lacks is copied; one
 * whose target history is a beginning of the source's is replaced; one the target has as is, or
 * further along, keeps its OpenCode rows (its Magic Context state follows `prefer`); diverged
 * histories are skipped.
 */
export class SyncSessionsUseCase implements SyncSessionsPort {
  private readonly deps: SyncSessionsDependencies

  constructor(deps: SyncSessionsDependencies) {
    this.deps = deps
  }

  sync(input: SessionSyncInput): SessionSyncReport {
    const { fileSystem, runtime, sqlite, store } = this.deps
    const read = {
      sourceOpencode: input.source.readableOpencodeDb ?? input.source.opencodeDb,
      targetOpencode: input.target.readableOpencodeDb ?? input.target.opencodeDb,
      sourceContext: input.source.readableContextDb ?? input.source.contextDb,
      targetContext: input.target.readableContextDb ?? input.target.contextDb,
    }
    for (const path of [read.sourceOpencode, read.targetOpencode]) if (!fileSystem.exists(path)) throw new DatabaseNotFoundError(path)
    const withContext = fileSystem.exists(read.sourceContext) && fileSystem.exists(read.targetContext)
    if (!input.dryRun) {
      this.deps.guard.assertNotHeld(input.target.opencodeDb)
      if (withContext) this.deps.guard.assertNotHeld(input.target.contextDb)
    }
    const sourceFormat = store.formatOf(read.sourceOpencode)
    const targetFormat = store.formatOf(read.targetOpencode)
    if (sourceFormat.join() !== targetFormat.join())
      throw new OpenCodeFormatMismatchError(input.source.opencodeDb, sourceFormat.at(-1) ?? "none", input.target.opencodeDb, targetFormat.at(-1) ?? "none")

    const work = joinPath(runtime.temporaryDirectory(), "opencode", `session-sync-${runtime.stamp()}`)
    fileSystem.mkdirp(work)
    try {
      const workSource = joinPath(work, "opencode-source.db")
      const workTarget = joinPath(work, "opencode-target.db")
      sqlite.vacuumInto(read.sourceOpencode, workSource)
      sqlite.vacuumInto(read.targetOpencode, workTarget)

      const families = this.plan(input, workSource, workTarget)
      const copies = families.flatMap((family) => (family.copy === null ? [] : [family.copy]))
      const results = new Map(store.copySessions(workSource, workTarget, copies).map((result) => [result.root, result]))
      const health = store.health(workTarget)
      const sessionsOk = copies.every((copy) =>
        copy.sessions.every((session) => {
          const stored = store.storedSession(workTarget, session.id)
          return stored !== null && stored.projectExists && stored.directory === session.directory && !(copy.rewriter?.residual(session.directory) ?? false)
        }),
      )

      const context = withContext
        ? this.deps.contexts.build({
            sourceContextDb: input.source.contextDb,
            readableSourceContextDb: read.sourceContext,
            targetContextDb: input.target.contextDb,
            readableTargetContextDb: read.targetContext,
            sourceOpencodeDb: workSource,
            targetOpencodeDb: workTarget,
            sessions: contextRequests(families, input.prefer),
            scope: input.context,
            workDir: work,
            mappingFor: (from) => families.find((family) => family.ids.includes(from.id))?.mapping ?? null,
          })
        : null
      const checks: SessionSyncChecks = { integrity_ok: health.integrity_ok, foreign_keys_ok: health.foreign_keys_ok, sessions_ok: sessionsOk, context: context?.checks ?? null }
      const failed = [...failedChecks({ integrity_ok: checks.integrity_ok, foreign_keys_ok: checks.foreign_keys_ok, sessions_ok: checks.sessions_ok }), ...failedChecks(checks.context ?? {})]
      if (failed.length > 0) throw new SyncVerificationError(failed)

      const contextById = new Map((context?.sessions ?? []).map((outcome) => [outcome.id, outcome]))
      const sessions = families.map((family): SessionSyncOutcome => {
        const result = results.get(family.outcome.id)
        return {
          ...family.outcome,
          rows_written: result?.rows ?? 0,
          residual_windows_paths: result?.residual_windows_paths ?? 0,
          context: contextById.get(family.outcome.id) ?? null,
        }
      })
      const changed = { opencode: copies.length > 0, context: context?.changed ?? false }
      const backupDir = input.dryRun || (!changed.opencode && !changed.context) ? null : this.replace(input, { opencode: changed.opencode ? workTarget : null, context: changed.context ? context!.workTarget : null })
      const databases = [...(changed.opencode ? [input.target.opencodeDb] : []), ...(changed.context ? [input.target.contextDb] : [])]
      return {
        source_opencode_db: input.source.opencodeDb,
        target_opencode_db: input.target.opencodeDb,
        source_context_db: withContext ? input.source.contextDb : null,
        target_context_db: withContext ? input.target.contextDb : null,
        dry_run: input.dryRun,
        context: input.context,
        sessions,
        projects: context?.projects ?? [],
        user_memories_copied: context?.user_memories_copied ?? 0,
        checks,
        backup_dir: backupDir,
        rollback: backupDir === null ? null : `opencode-session-manager rollback ${backupDir} ${databases.map((db) => `--db ${db}`).join(" ")}`,
      }
    } finally {
      fileSystem.removeTree(work)
    }
  }

  private plan(input: SessionSyncInput, workSource: string, workTarget: string): FamilyPlan[] {
    const { sessions, store, runtime } = this.deps
    const sourceSessions = byId(sessions.sessions(workSource))
    const targetSessions = byId(sessions.sessions(workTarget))
    const children = new Map<string, string[]>()
    for (const session of sourceSessions.values())
      if (session.parentId !== null && sourceSessions.has(session.parentId)) children.set(session.parentId, [...(children.get(session.parentId) ?? []), session.id])
    const familyOf = (root: string): string[] => [root, ...(children.get(root) ?? []).flatMap(familyOf)]

    const hidden = new Set(input.sessions === "all" ? store.hiddenRuns(workSource) : [])
    const roots =
      input.sessions === "all"
        ? [...sourceSessions.values()].filter((session) => session.parentId === null || !sourceSessions.has(session.parentId)).map((session) => session.id)
        : [...new Set(input.sessions)]
    const present = roots.filter((id) => sourceSessions.has(id) && !hidden.has(id))
    const base = mappingFromRules(
      input.maps,
      present.flatMap(familyOf).map((id) => sourceSessions.get(id)!.directory),
      runtime.homeDirectory(),
    )
    const baseRewriter = base === null ? null : this.deps.rewriterFor(base)
    const targetProjects = store.projects(workTarget)
    const sourceProjects = new Map(store.projects(workSource).map((project) => [project.id, project.worktree]))
    const now = runtime.now()

    return roots.map((root): FamilyPlan => {
      const from = sourceSessions.get(root)
      const blank = { id: root, sessions_written: 0, project_id: null, project_source: null, target_directory: null }
      if (from === undefined)
        return { outcome: { ...blank, title: null, relation: null, action: "skip", reason: "not-on-source", source_directory: null }, ids: [], copy: null, mapping: null }
      if (hidden.has(root))
        return { outcome: { ...blank, title: from.title, relation: null, action: "skip", reason: "hidden-run", source_directory: from.directory }, ids: [], copy: null, mapping: null }
      const to = targetSessions.get(root)
      const relation: SessionRelation =
        to === undefined ? "missing" : relationOf(sessions.messageIds(workSource, root, from.generation), sessions.messageIds(workTarget, root, to.generation))
      const action = actionFor(relation)
      const ids = familyOf(root)
      const mapped = (directory: string) => baseRewriter?.rewrite(directory) ?? directory
      // A session the target already has keeps its folder there: the text follows it.
      const mapping = to === undefined || mapped(from.directory) === to.directory ? base : withRelocation(base, mapped(from.directory), to.directory, runtime.homeDirectory())
      const head = { id: root, title: from.title, relation, action, source_directory: from.directory }
      if (action === "skip" || action === "keep")
        return {
          outcome: { ...head, reason: action === "skip" ? "diverged" : null, sessions_written: 0, target_directory: to?.directory ?? null, project_id: to?.projectId ?? null, project_source: null },
          ids,
          copy: null,
          mapping,
        }

      const rewriter = mapping === null ? null : this.deps.rewriterFor(mapping)
      const projects = new Map<string, ProjectPlan>()
      const rows = ids.map((id): SessionRowPlan & { source: ProjectSource } => {
        const session = sourceSessions.get(id)!
        const existing = targetSessions.get(id)
        if (existing !== undefined) {
          const worktree = targetProjects.find((project) => project.id === existing.projectId)?.worktree
          return { id, projectId: existing.projectId, directory: existing.directory, path: subpath(worktree, existing.directory), source: "target" }
        }
        const directory = rewriter?.rewrite(session.directory) ?? session.directory
        const resolved = this.deps.fileSystem.exists(directory) ? this.deps.identity.resolve(directory) : null
        if (resolved !== null) {
          projects.set(resolved.id, { id: resolved.id, worktree: resolved.worktree, vcs: resolved.vcs, templateId: sourceProjects.has(session.projectId) ? session.projectId : null })
          return { id, projectId: resolved.id, directory, path: sessionSubpath(resolved.worktree, resolved.real), source: "derived" }
        }
        const holder = targetProjects
          .filter((project) => project.worktree !== "/" && isWithin(project.worktree, directory))
          .sort((a, b) => b.worktree.length - a.worktree.length)[0]
        if (holder !== undefined) return { id, projectId: holder.id, directory, path: sessionSubpath(holder.worktree, directory), source: "target" }
        const worktree = rewriter?.rewrite(sourceProjects.get(session.projectId) ?? "/") ?? sourceProjects.get(session.projectId) ?? "/"
        projects.set(session.projectId, { id: session.projectId, worktree, vcs: null, templateId: sourceProjects.has(session.projectId) ? session.projectId : null })
        return { id, projectId: session.projectId, directory, path: subpath(worktree, directory), source: "source" }
      })
      const first = rows[0]!
      return {
        outcome: {
          ...head,
          reason: null,
          sessions_written: rows.length,
          target_directory: first.directory,
          project_id: first.projectId,
          project_source: first.source,
        },
        ids,
        copy: { root, sessions: rows.map(({ source: _source, ...row }) => row), projects: [...projects.values()], rewriter, now },
        mapping,
      }
    })
  }

  /**
   * Puts the checked copies in place by renames: each is first copied next to its target (they may
   * be on another file system), then swapped in, the originals moved into one backup folder. When
   * the second swap fails, the first is undone, so the two stores never disagree.
   */
  private replace(input: SessionSyncInput, copies: { readonly opencode: string | null; readonly context: string | null }): string {
    const { fileSystem, runtime, guard, swap } = this.deps
    const stamp = runtime.stamp()
    const backupDir = joinPath(dirName(input.target.opencodeDb), `sync-backup-${stamp}`)
    const steps = [
      ...(copies.opencode === null ? [] : [{ dbPath: input.target.opencodeDb, work: copies.opencode }]),
      ...(copies.context === null ? [] : [{ dbPath: input.target.contextDb, work: copies.context }]),
    ].map((step) => ({ ...step, incoming: `${step.dbPath}.incoming-${stamp}` }))
    for (const step of steps) {
      guard.assertNotHeld(step.dbPath)
      guard.checkSpace({ dbPath: step.dbPath, requiredBytes: fileSystem.size(step.work) })
    }
    const done: { readonly step: (typeof steps)[number]; readonly moved: readonly string[] }[] = []
    try {
      for (const step of steps) {
        fileSystem.copyFile(step.work, step.incoming)
        done.push({ step, moved: swap.swap({ dbPath: step.dbPath, compacted: step.incoming, backupDir }) })
      }
    } catch (error) {
      for (const { step, moved } of done.reverse()) swap.undo({ dbPath: step.dbPath, compacted: step.incoming, backupDir }, moved)
      for (const step of steps) if (fileSystem.exists(step.incoming)) fileSystem.remove(step.incoming)
      throw error
    }
    return backupDir
  }
}

/** One entry per id, the OpenCode 2 row winning over the OpenCode 1 row of the same session. */
function byId(list: readonly StoredSession[]): Map<string, StoredSession> {
  const map = new Map<string, StoredSession>()
  for (const session of list) if (session.generation === "v2" || !map.has(session.id)) map.set(session.id, session)
  return map
}

function subpath(worktree: string | undefined, directory: string): string | null {
  return worktree !== undefined && isWithin(worktree, directory) ? sessionSubpath(worktree, directory) : null
}

/** The base mapping, plus moving the folder the base maps the session to onto where the target keeps it. */
function withRelocation(base: PathMapping | null, from: string, to: string, home: string): PathMapping {
  const relocation = { from, to }
  return base === null
    ? { home, windowsUser: NO_WINDOWS_PROFILE, drive: NO_WINDOWS_PROFILE, relocations: [relocation] }
    : { ...base, relocations: [...base.relocations, relocation] }
}

/** The Magic Context requests the families imply: written sessions take the source's state; kept ones follow `prefer`. */
function contextRequests(families: readonly FamilyPlan[], prefer: Prefer): SyncRequest[] {
  const resolution: Record<Prefer, Resolution> = { further: "further", keep: "skip", replace: "replace" }
  return families.flatMap((family) => {
    const action = family.outcome.action
    if (action === "skip") return []
    const chosen: Resolution = action === "keep" ? resolution[prefer] : "replace"
    return family.ids.map((id) => ({ id, resolution: chosen }))
  })
}
