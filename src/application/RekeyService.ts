import { GLOBAL_PROJECT, type ProjectIdentity, type ProjectRecord, type RekeyReport } from "@session-manager/domain/model/Migration"
import type { MigrationDatabase } from "@session-manager/domain/ports/outbound/MigrationStorePort"
import type { ProjectIdentityPort } from "@session-manager/domain/ports/outbound/ProjectIdentityPort"
import type { RuntimePort } from "@session-manager/domain/ports/outbound/RuntimePort"
import { isWithin, sessionSubpath } from "@session-manager/domain/services/PosixPaths"

/**
 * Gives every session the project OpenCode derives for its folder on this machine. OpenCode only
 * lists a folder's sessions under the id it computes itself, and ids computed on Windows (from a
 * Windows path, or a remote spelled differently) never match. A session whose folder is missing
 * here keeps its project, re-keyed when that project's own worktree resolves. A project that
 * nothing points at any more is removed.
 */
export class RekeyService {
  private readonly identity: ProjectIdentityPort
  private readonly runtime: RuntimePort

  constructor(identity: ProjectIdentityPort, runtime: RuntimePort) {
    this.identity = identity
    this.runtime = runtime
  }

  rekey(db: MigrationDatabase): RekeyReport {
    return db.transaction(() => {
      const projects = new Map(db.projects().map((project) => [project.id, project]))
      const remap = new Map<string, ProjectIdentity>()
      for (const project of projects.values()) {
        if (project.id === GLOBAL_PROJECT) continue
        const resolved = this.identity.resolve(project.worktree)
        if (resolved !== null && resolved.id !== project.id) remap.set(project.id, resolved)
      }

      const worktrees = new Map([...projects.values()].map((project) => [project.id, project.worktree]))
      let created = 0
      // A project that already exists under the derived id takes the worktree derived here.
      const ensure = (target: ProjectIdentity, template: string): void => {
        const stored = worktrees.get(target.id)
        if (stored === undefined) {
          db.insertProject(this.projectRow(target, projects.get(template)))
          created++
        } else if (stored !== target.worktree) db.updateProject(target.id, target.worktree, target.vcs)
        worktrees.set(target.id, target.worktree)
      }

      const missing = new Set<string>()
      let rekeyed = 0
      let subpaths = 0
      for (const session of db.sessions()) {
        const resolved = session.directory === null ? null : this.identity.resolve(session.directory)
        if (resolved === null) {
          if (session.directory !== null) missing.add(session.directory)
          const target = remap.get(session.projectId)
          if (target !== undefined) ensure(target, session.projectId)
          const projectId = target?.id ?? session.projectId
          const worktree = worktrees.get(projectId)
          const path =
            worktree !== undefined && session.directory !== null && isWithin(worktree, session.directory)
              ? sessionSubpath(worktree, session.directory)
              : session.path
          if (projectId !== session.projectId || path !== session.path) {
            db.updateSession(session, projectId, path)
            if (projectId !== session.projectId) rekeyed++
            else subpaths++
          }
          continue
        }
        ensure(resolved, session.projectId)
        const path = sessionSubpath(resolved.worktree, resolved.real)
        if (resolved.id !== session.projectId || path !== session.path) {
          db.updateSession(session, resolved.id, path)
          rekeyed++
        }
      }

      const references = db.projectReferences()
      for (const [from, target] of remap) {
        ensure(target, from)
        for (const reference of references) db.repoint(reference, from, target.id)
      }

      const used = new Set(db.sessions().map((session) => session.projectId))
      let dropped = 0
      for (const from of remap.keys()) {
        if (used.has(from)) continue
        db.deleteProject(from)
        dropped++
      }

      return {
        projects_remapped: remap.size,
        projects_created: created,
        projects_dropped: dropped,
        sessions_rekeyed: rekeyed,
        subpaths_fixed: subpaths,
        missing_directories: [...missing].sort(),
      }
    })
  }

  /** A new project row: a copy of the project it replaces, so its name, icon and commands survive. */
  private projectRow(target: ProjectIdentity, template: ProjectRecord | undefined): ProjectRecord {
    const now = BigInt(this.runtime.now())
    const base: Record<string, unknown> =
      template !== undefined && template.id !== GLOBAL_PROJECT
        ? { ...template }
        : { time_created: now, sandboxes: "[]", time_active: 0n }
    return { ...base, id: target.id, worktree: target.worktree, vcs: target.vcs, time_updated: now }
  }
}
