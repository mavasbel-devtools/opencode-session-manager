import type { CatalogedSession } from "@session-manager/domain/model/SessionCatalog"
import {
  countBySeverity,
  type Finding,
  finding,
  type VerifiedSession,
  type VerifyInput,
  type VerifyReport,
  vitalsFindings,
} from "@session-manager/domain/model/Verify"
import type { VerifyCatalog, VerifyProfilePort } from "@session-manager/domain/ports/inbound/VerifyProfilePort"
import type { MagicContextIdentityPort } from "@session-manager/domain/ports/outbound/MagicContextIdentityPort"
import type { MagicContextStorePort } from "@session-manager/domain/ports/outbound/MagicContextStorePort"
import type { MagicContextSyncStorePort, StoreHealth } from "@session-manager/domain/ports/outbound/MagicContextSyncStorePort"
import type { MaintenanceFileSystemPort } from "@session-manager/domain/ports/outbound/MaintenanceFileSystemPort"
import type { ProjectIdentityPort } from "@session-manager/domain/ports/outbound/ProjectIdentityPort"
import type { RuntimePort } from "@session-manager/domain/ports/outbound/RuntimePort"
import type { SessionStorePort } from "@session-manager/domain/ports/outbound/SessionStorePort"
import type { SessionSyncStorePort } from "@session-manager/domain/ports/outbound/SessionSyncStorePort"

export interface VerifyProfileDependencies {
  readonly sessions: SessionStorePort
  readonly opencodeStore: Pick<SessionSyncStorePort, "health">
  readonly contexts: Pick<MagicContextStorePort, "formatVersion" | "summary">
  readonly contextStore: Pick<MagicContextSyncStorePort, "health" | "sourceState" | "vitals">
  readonly identity: ProjectIdentityPort
  readonly contextIdentity: MagicContextIdentityPort
  readonly fileSystem: Pick<MaintenanceFileSystemPort, "exists">
  readonly runtime: Pick<RuntimePort, "now">
}

/** One remembered answer per folder: deriving a project id may run git. */
function memo<T>(derive: (directory: string) => T): (directory: string) => T {
  const known = new Map<string, T>()
  return (directory) => {
    if (!known.has(directory)) known.set(directory, derive(directory))
    return known.get(directory) as T
  }
}

/**
 * Checks a profile, reading only (safe while OpenCode runs): both stores pass SQLite's integrity
 * and foreign-key checks; each session's project is the one OpenCode and Magic Context derive for
 * its folder; its summaries point at messages its history holds; how far its summaries lag, how
 * large its last prompt was, and whether a wrapup is running or was left behind; and Magic Context
 * state for sessions the OpenCode store does not have.
 */
export class VerifyProfileUseCase implements VerifyProfilePort {
  private readonly deps: VerifyProfileDependencies

  constructor(deps: VerifyProfileDependencies) {
    this.deps = deps
  }

  verify(input: VerifyInput, catalog: VerifyCatalog): VerifyReport {
    const { sessions, opencodeStore, contexts, contextStore, fileSystem, runtime } = this.deps
    const opencodeDb = input.readableOpencodeDb ?? input.opencodeDb
    const contextDb = input.readableContextDb ?? input.contextDb
    const withContext = fileSystem.exists(contextDb)
    const findings: Finding[] = []
    const storeFindings = (path: string, health: StoreHealth) => {
      if (!health.integrity_ok) findings.push(finding("store-integrity", null, `${path} fails PRAGMA integrity_check`))
      if (!health.foreign_keys_ok) findings.push(finding("store-foreign-keys", null, `${path} has rows whose foreign key points at nothing`))
    }
    const opencodeHealth = opencodeStore.health(opencodeDb)
    storeFindings(input.opencodeDb, opencodeHealth)
    const contextHealth = withContext ? contextStore.health(contextDb) : null
    if (contextHealth !== null) storeFindings(input.contextDb, contextHealth)

    const byId = new Map<string, CatalogedSession>()
    for (const session of catalog.sessions) if (session.generation === "v2" || !byId.has(session.id)) byId.set(session.id, session)
    if (input.sessions !== "all")
      for (const id of input.sessions) if (!byId.has(id)) findings.push(finding("session-not-found", id, "the profile has no such session"))
    const chosen = input.sessions === "all" ? [...byId.values()] : [...new Set(input.sessions)].flatMap((id) => byId.get(id) ?? [])
    if (input.sessions === "all" && withContext)
      for (const [id, stats] of Object.entries(contexts.summary(contextDb).sessions))
        // Memories belong to the project and outlive the session that wrote them; only session state counts.
        if (!byId.has(id) && stats.compartments + stats.tags + stats.notes > 0)
          findings.push(
            finding("orphan-context-state", id, `Magic Context holds ${stats.compartments} summaries, ${stats.tags} tags and ${stats.notes} notes for a session the OpenCode store does not have`),
          )

    const projectOf = memo((directory) => (fileSystem.exists(directory) ? this.deps.identity.resolve(directory) : null))
    const contextProjectOf = memo((directory) => (fileSystem.exists(directory) ? this.deps.contextIdentity.identityOf(directory) : null))
    const now = runtime.now()
    const verified = chosen.map((session): VerifiedSession => {
      const ids = sessions.messageIds(opencodeDb, session.id, session.generation)
      const derived = projectOf(session.directory)
      if (derived !== null && derived.id !== session.projectId)
        findings.push(finding("project-mismatch", session.id, `stored project ${session.projectId}, OpenCode derives ${derived.id} for ${session.directory}`))
      const stats = session.magicContext
      if (!withContext || stats === null)
        return { id: session.id, title: session.title, directory: session.directory, messages: ids.length, summaries: 0, unsummarized: null, last_context_percentage: null, wrapup: null }

      const held = new Set(ids)
      const missing = contextStore.sourceState(contextDb, session.id).anchors.filter((anchor) => !held.has(anchor))
      if (missing.length > 0) findings.push(finding("stale-summaries", session.id, `${missing.length} message ids its summaries point at are not in its history`))
      const contextProject = contextProjectOf(session.directory)
      if (stats.project !== null && contextProject !== null && contextProject !== stats.project)
        findings.push(finding("context-project-mismatch", session.id, `Magic Context records ${stats.project}, derives ${contextProject} for ${session.directory}`))
      const vitals = contextStore.vitals(contextDb, session.id, now)
      const end = vitals.lastSummarizedMessageId === null ? -1 : ids.indexOf(vitals.lastSummarizedMessageId)
      const unsummarized = vitals.lastSummarizedMessageId !== null && end === -1 ? null : ids.length - end - 1
      findings.push(...vitalsFindings(session.id, vitals, unsummarized, input.behind))
      return {
        id: session.id,
        title: session.title,
        directory: session.directory,
        messages: ids.length,
        summaries: stats.compartments,
        unsummarized,
        last_context_percentage: vitals.lastContextPercentage,
        wrapup: vitals.wrapup,
      }
    })

    const counts = countBySeverity(findings)
    return {
      opencode_db: input.opencodeDb,
      context_db: withContext ? input.contextDb : null,
      magic_context_format: withContext ? contexts.formatVersion(contextDb) : null,
      checks: { opencode: opencodeHealth, context: contextHealth },
      sessions_checked: verified.length,
      sessions: verified,
      findings,
      counts,
      ok: counts.error === 0,
    }
  }
}
