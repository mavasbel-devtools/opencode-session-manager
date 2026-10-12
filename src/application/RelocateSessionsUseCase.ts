import type { GuardService } from "@session-manager/application/GuardService"
import type { JointSwapService } from "@session-manager/application/JointSwapService"
import type { StoreLockService } from "@session-manager/application/StoreLockService"
import { RelocateBusyError } from "@session-manager/domain/errors/RelocateBusyError"
import { DatabaseNotFoundError } from "@session-manager/domain/errors/DatabaseNotFoundError"
import { RelocateVerificationError } from "@session-manager/domain/errors/RelocateVerificationError"
import { dirName, joinPath } from "@session-manager/domain/model/DatabasePaths"
import { failedChecks } from "@session-manager/domain/model/MagicContextSync"
import type { RelocatedSession, RelocateChecks, RelocateInput, RelocateReport, RelocateSkip } from "@session-manager/domain/model/Relocate"
import type { StoredSession } from "@session-manager/domain/model/SessionCatalog"
import type { StaleLock } from "@session-manager/domain/model/StoreLock"
import type { RelocateSessionsPort } from "@session-manager/domain/ports/inbound/RelocateSessionsPort"
import type { ContextLink, MagicContextRelocationStorePort } from "@session-manager/domain/ports/outbound/MagicContextRelocationStorePort"
import type { MagicContextIdentityPort } from "@session-manager/domain/ports/outbound/MagicContextIdentityPort"
import type { MagicContextSyncStorePort, ProjectMerge } from "@session-manager/domain/ports/outbound/MagicContextSyncStorePort"
import type { MaintenanceFileSystemPort } from "@session-manager/domain/ports/outbound/MaintenanceFileSystemPort"
import type { ProjectIdentityPort } from "@session-manager/domain/ports/outbound/ProjectIdentityPort"
import type { RelocationStorePort, SessionMove, TextRewrite } from "@session-manager/domain/ports/outbound/RelocationStorePort"
import type { RuntimePort } from "@session-manager/domain/ports/outbound/RuntimePort"
import type { SessionStorePort } from "@session-manager/domain/ports/outbound/SessionStorePort"
import type { ProjectPlan, SessionSyncStorePort } from "@session-manager/domain/ports/outbound/SessionSyncStorePort"
import type { SqlitePort } from "@session-manager/domain/ports/outbound/SqlitePort"
import type { TextRewriter } from "@session-manager/domain/services/PathRewriter"
import type { PathMapping } from "@session-manager/domain/model/PathMapping"
import { relocatedFolder, relocationsFromRules } from "@session-manager/domain/services/RelocateRules"
import { isWithin, sessionSubpath } from "@session-manager/domain/services/PosixPaths"

export interface RelocateSessionsDependencies {
  readonly sqlite: SqlitePort
  readonly sessions: SessionStorePort
  readonly opencode: SessionSyncStorePort
  readonly relocation: RelocationStorePort
  readonly context: MagicContextSyncStorePort
  readonly contextRelocation: MagicContextRelocationStorePort
  readonly identity: ProjectIdentityPort
  readonly contextIdentity: MagicContextIdentityPort
  readonly guard: GuardService
  readonly locks: StoreLockService
  readonly joint: JointSwapService
  readonly fileSystem: MaintenanceFileSystemPort
  readonly runtime: RuntimePort
  readonly rewriterFor: (mapping: PathMapping) => TextRewriter
}

/** What one relocation does, decided on the working copies before anything is written. */
interface Plan {
  readonly moved: readonly RelocatedSession[]
  readonly moves: readonly SessionMove[]
  readonly projects: readonly ProjectPlan[]
  readonly links: readonly ContextLink[]
  readonly merges: readonly ProjectMerge[]
  readonly skipped: readonly RelocateSkip[]
}

/**
 * Moves sessions to the folders their files now live in, inside one profile: each session in a
 * mapped folder (with its sub-agent sessions) gets its new folder and the project OpenCode derives
 * there; every text cell naming an old folder is rewritten; in Magic Context, each session is linked
 * to the project Magic Context derives for its new folder, the old project's memories, notes and
 * primers are merged into the new one, and text is rewritten the same way.
 *
 * Only working copies are written (`VACUUM INTO`); they must pass their checks; then both replace
 * the profile's stores by renames, the originals kept in one backup folder that a single `rollback`
 * restores. A family is moved whole or not at all: when one of its new folders does not exist here,
 * it stays and is reported. Refused while Magic Context works on a session it would move.
 */
export class RelocateSessionsUseCase implements RelocateSessionsPort {
  constructor(private readonly deps: RelocateSessionsDependencies) {}

  relocate(input: RelocateInput): RelocateReport {
    const { fileSystem } = this.deps
    const relocations = relocationsFromRules(input.maps, this.deps.runtime.homeDirectory())
    const readOpencode = input.profile.readableOpencodeDb ?? input.profile.opencodeDb
    const readContext = input.profile.readableContextDb ?? input.profile.contextDb
    if (!fileSystem.exists(readOpencode)) throw new DatabaseNotFoundError(readOpencode)
    const withContext = fileSystem.exists(readContext)
    const run = (cleared: readonly StaleLock[]) => this.run(input, relocations, readOpencode, withContext ? readContext : null, cleared)
    if (input.dryRun) return run([])
    this.deps.guard.assertNotHeld(input.profile.opencodeDb)
    if (withContext) this.deps.guard.assertNotHeld(input.profile.contextDb)
    return this.deps.locks.hold([input.profile.opencodeDb, ...(withContext ? [input.profile.contextDb] : [])], "relocate", run)
  }

  private run(
    input: RelocateInput,
    relocations: ReturnType<typeof relocationsFromRules>,
    readOpencode: string,
    readContext: string | null,
    cleared: readonly StaleLock[],
  ): RelocateReport {
    const { fileSystem, runtime, sqlite } = this.deps
    const work = joinPath(runtime.temporaryDirectory(), "opencode", `relocate-${runtime.stamp()}`)
    fileSystem.mkdirp(work)
    try {
      const workOpencode = joinPath(work, "opencode.db")
      sqlite.vacuumInto(readOpencode, workOpencode)
      const contextFiles = readContext === null ? null : { before: joinPath(work, "context-before.db"), work: joinPath(work, "context.db") }
      if (contextFiles !== null) {
        sqlite.vacuumInto(readContext!, contextFiles.before)
        sqlite.vacuumInto(readContext!, contextFiles.work)
      }

      const plan = this.plan(input, relocations.folders, workOpencode, contextFiles?.work ?? null, relocations.mapping)
      const now = runtime.now()
      const busy = contextFiles === null ? [] : plan.moved.map((session) => session.id).filter((id) => this.deps.context.busy(readContext!, id, now))
      if (busy.length > 0) throw new RelocateBusyError(busy)

      const rewrite: TextRewrite = {
        rewriter: this.deps.rewriterFor(relocations.mapping),
        hints: relocations.hints,
        scope: input.sessions === "all" ? "all" : { sessions: [...new Set(plan.moved.map((session) => session.id))] },
      }
      const moved = this.deps.relocation.moveSessions(workOpencode, plan.moves, plan.projects, now)
      const text = this.deps.relocation.rewriteText(workOpencode, rewrite)
      const health = this.deps.opencode.health(workOpencode)
      const sessionsOk = plan.moves.every((move) => {
        const stored = this.deps.opencode.storedSession(workOpencode, move.id)
        return stored !== null && stored.directory === move.directory && stored.projectId === move.projectId && stored.projectExists
      })

      let contextText = null
      let merged: RelocateReport["projects_merged"] = []
      let contextChecks: RelocateChecks["context"] = null
      let contextChanged = false
      if (contextFiles !== null) {
        if (plan.merges.length > 0)
          merged = this.deps.context.copySessions(contextFiles.before, contextFiles.work, [], { originatedMemories: false, projects: plan.merges, userMemories: false, now }).projects
        const relinked = this.deps.contextRelocation.relink(contextFiles.work, plan.links)
        contextText = this.deps.contextRelocation.rewriteText(contextFiles.work, rewrite)
        const contextHealth = this.deps.context.health(contextFiles.work)
        contextChecks = {
          integrity_ok: contextHealth.integrity_ok,
          foreign_keys_ok: contextHealth.foreign_keys_ok,
          links_ok: plan.links.every((link) => this.deps.context.recordedProject(contextFiles.work, link.sessionId) === link.project),
          text_ok: Object.keys(contextText.residual).length === 0,
        }
        const mergedSomething = merged.some((merge) => merge.memories_copied + merge.notes + merge.primers + merge.dream_runs + merge.retrospective_windows + merge.verifications > 0)
        contextChanged = relinked > 0 || mergedSomething || Object.keys(contextText.rows).length > 0 || contextText.snapshots_cleared > 0
      }

      const checks: RelocateChecks = {
        integrity_ok: health.integrity_ok,
        foreign_keys_ok: health.foreign_keys_ok,
        sessions_ok: sessionsOk,
        text_ok: Object.keys(text.residual).length === 0,
        context: contextChecks,
      }
      const failed = [...failedChecks({ ...checks, context: true }), ...failedChecks(checks.context ?? {}).map((name) => `context ${name}`)]
      // A dry run reports a failed check; a run refuses before anything is replaced.
      if (failed.length > 0 && !input.dryRun) throw new RelocateVerificationError(failed)

      const opencodeChanged = moved > 0 || Object.keys(text.rows).length > 0
      const steps = [
        ...(opencodeChanged ? [{ dbPath: input.profile.opencodeDb, work: workOpencode }] : []),
        ...(contextChanged && contextFiles !== null ? [{ dbPath: input.profile.contextDb, work: contextFiles.work }] : []),
      ]
      let backupDir: string | null = null
      if (!input.dryRun && steps.length > 0) {
        const stamp = runtime.stamp()
        backupDir = joinPath(dirName(input.profile.opencodeDb), `relocate-backup-${stamp}`)
        this.deps.joint.replace(steps, backupDir, stamp)
      }
      return {
        opencode_db: input.profile.opencodeDb,
        context_db: contextFiles === null ? null : input.profile.contextDb,
        dry_run: input.dryRun,
        rules: relocations.folders,
        sessions: plan.moved,
        skipped: plan.skipped,
        projects_created: plan.projects.map((project) => project.id),
        text,
        context_text: contextText,
        projects_merged: merged,
        checks,
        failed,
        backup_dir: backupDir,
        rollback: backupDir === null ? null : `opencode-session-manager rollback ${backupDir} ${steps.map((step) => `--db ${step.dbPath}`).join(" ")}`,
        stale_locks_cleared: cleared,
      }
    } finally {
      fileSystem.removeTree(work)
    }
  }

  private plan(input: RelocateInput, folders: Parameters<typeof relocatedFolder>[0], workOpencode: string, workContext: string | null, mapping: PathMapping): Plan {
    const { fileSystem, identity, contextIdentity } = this.deps
    const all = new Map<string, StoredSession>()
    for (const session of this.deps.sessions.sessions(workOpencode)) if (session.generation === "v2" || !all.has(session.id)) all.set(session.id, session)
    const children = new Map<string, string[]>()
    for (const session of all.values()) if (session.parentId !== null && all.has(session.parentId)) children.set(session.parentId, [...(children.get(session.parentId) ?? []), session.id])
    const familyOf = (root: string): string[] => [root, ...(children.get(root) ?? []).flatMap(familyOf)]
    const rootOf = (id: string): string => {
      const parent = all.get(id)!.parentId
      return parent !== null && all.has(parent) ? rootOf(parent) : id
    }
    const mapped = (session: StoredSession) => relocatedFolder(folders, session.directory)

    const skipped: RelocateSkip[] = []
    let roots: string[]
    if (input.sessions === "all") roots = [...new Set([...all.values()].filter((session) => mapped(session) !== null).map((session) => rootOf(session.id)))]
    else {
      roots = []
      for (const id of new Set(input.sessions)) {
        const session = all.get(id)
        if (session === undefined) skipped.push({ id, directory: null, reason: "not-found", to_directory: null })
        else if (!familyOf(rootOf(id)).some((member) => mapped(all.get(member)!) !== null)) skipped.push({ id, directory: session.directory, reason: "not-mapped", to_directory: null })
        else roots.push(rootOf(id))
      }
      roots = [...new Set(roots)]
    }

    const projectWorktrees = new Map(this.deps.opencode.projects(workOpencode).map((project) => [project.id, project.worktree]))
    const moved: RelocatedSession[] = []
    const moves: SessionMove[] = []
    const projects = new Map<string, ProjectPlan>()
    const links: ContextLink[] = []
    const merges = new Map<string, ProjectMerge>()
    const rewriter = this.deps.rewriterFor(mapping)
    for (const root of roots) {
      const family = familyOf(root).filter((id) => mapped(all.get(id)!) !== null)
      const missing = family.find((id) => {
        const to = mapped(all.get(id)!)!
        return !fileSystem.exists(to) || identity.resolve(to) === null
      })
      if (missing !== undefined) {
        const session = all.get(missing)!
        skipped.push({ id: missing, directory: session.directory, reason: "folder-missing", to_directory: mapped(session) })
        continue
      }
      for (const id of family) {
        const session = all.get(id)!
        const to = mapped(session)!
        const resolved = identity.resolve(to)!
        if (!projectWorktrees.has(resolved.id) && !projects.has(resolved.id))
          projects.set(resolved.id, { id: resolved.id, worktree: resolved.worktree, vcs: resolved.vcs, templateId: null })
        const path = isWithin(resolved.worktree, resolved.real) ? sessionSubpath(resolved.worktree, resolved.real) : null
        moves.push({ id, directory: to, projectId: resolved.id, path })
        const contextFrom = workContext === null ? null : this.deps.context.recordedProject(workContext, id)
        const contextTo = workContext === null ? null : contextIdentity.identityOf(to)
        if (contextFrom !== null && contextTo !== null) {
          links.push({ sessionId: id, project: contextTo })
          if (contextFrom !== contextTo && !merges.has(`${contextFrom}\u0000${contextTo}`)) merges.set(`${contextFrom}\u0000${contextTo}`, { from: contextFrom, to: contextTo, rewriter })
        }
        moved.push({
          id,
          root,
          title: session.title,
          from_directory: session.directory,
          to_directory: to,
          from_project: session.projectId,
          to_project: resolved.id,
          context_from_project: contextFrom,
          context_to_project: contextFrom === null ? null : contextTo,
        })
      }
    }
    return { moved, moves, projects: [...projects.values()], links, merges: [...merges.values()], skipped }
  }
}
