import { createHash, randomBytes } from "node:crypto"
import { and, asc, count, desc, eq, getTableColumns, getTableName, inArray, max, ne, type SQL } from "drizzle-orm"
import type { SQLiteColumn, SQLiteTable } from "drizzle-orm/sqlite-core"
import { UnknownStoreSchemaError } from "@session-manager/domain/errors/UnknownStoreSchemaError"
import type { Harness, ProjectMergeResult } from "@session-manager/domain/model/MagicContextSync"
import type {
  CopyOptions,
  CopyOutcome,
  CopyResult,
  MagicContextSyncStorePort,
  PlannedCopy,
  ProjectMerge,
  SourceSessionState,
  StoredSessionState,
  StoreHealth,
} from "@session-manager/domain/ports/outbound/MagicContextSyncStorePort"
import type { TextRewriter } from "@session-manager/domain/services/PathRewriter"
import { type Orm, type Row, openStore, type Store, withStore } from "@session-manager/infrastructure/adapters/outbound/sqlite/engine/Store"
import {
  authorityManaged as authorityManagedTable,
  authorityRepairPending,
  compartmentChunkEmbeddings,
  compartmentEvents,
  compartmentHistoryVersions,
  compartments,
  compartmentStateLease,
  compressionDepth,
  contextPrivilegeState,
  dreamRuns,
  historianRuns,
  lkgSlotChunks,
  lkgSlots,
  memories,
  memoryEmbeddings,
  memoryVerifications,
  notes,
  pendingOps,
  primerCandidates,
  primers,
  projectState,
  recompCompartments,
  recompFacts,
  retrospectiveProcessedWindows,
  sessionFacts,
  sessionMeta,
  sessionProjects,
  sourceContents,
  subagentInvocations,
  tags,
  TABLES,
  userMemories,
  userMemoryCandidates,
} from "@session-manager/infrastructure/adapters/outbound/sqlite/schema/magic-context"

type Keyed = SQLiteTable & { session_id: SQLiteColumn }

/**
 * Session-scoped tables a copy empties for the session, in Magic Context's own deletion order
 * (`SESSION_SCOPED_TABLES`, `storage-session-tables.ts`). Caches, leases and in-progress work
 * (`compartment_state_lease`, `lkg_*`, `recomp_*`) are emptied and rebuilt by Magic Context, never
 * copied. Its message search index, transform decisions and plugin queues describe the target's own
 * runs and are kept.
 */
const CLEARED: readonly Keyed[] = [
  pendingOps,
  sourceContents,
  tags,
  compartmentChunkEmbeddings,
  compartments,
  compressionDepth,
  sessionFacts,
  compartmentStateLease,
  recompCompartments,
  recompFacts,
  compartmentEvents,
  subagentInvocations,
  historianRuns,
  primerCandidates,
  userMemoryCandidates,
  lkgSlotChunks,
  lkgSlots,
] as unknown as Keyed[]

/** Copied as rows keyed by the session, ids reassigned by the target. */
const PLAIN: readonly Keyed[] = [tags, sourceContents, pendingOps, sessionFacts, compressionDepth] as unknown as Keyed[]

/** Every table a copy reads rows from: a store whose copy of them has columns the schema lacks is refused. */
const READ: readonly SQLiteTable[] = [
  compartments,
  compartmentChunkEmbeddings,
  compartmentEvents,
  ...PLAIN,
  notes,
  historianRuns,
  subagentInvocations,
  primerCandidates,
  userMemoryCandidates,
  memories,
  memoryEmbeddings,
  memoryVerifications,
  primers,
  dreamRuns,
  retrospectiveProcessedWindows,
  userMemories,
]

/** Text columns that hold keys, never prose: never rewritten. */
const KEYS = new Set([
  "session_id",
  "harness",
  "project_path",
  "message_id",
  "start_message_id",
  "end_message_id",
  "source_start_message_id",
  "source_end_message_id",
  "tool_owner_message_id",
  "normalized_hash",
  "normalized_question",
  "model_id",
  "question_embedding_model_id",
  "chunk_hash",
  "content_hash",
])

const INJECTABLE = ["active", "permanent"]

/**
 * Reads and writes session state in Magic Context stores through the store engine and the typed
 * Magic Context schema. Only ever given working copies: a copy reads the source and rewrites the
 * target's rows for each session, and merges the projects' state, in one transaction.
 */
export class BunMagicContextSyncStoreAdapter implements MagicContextSyncStorePort {
  constructor() {}

  sourceState(contextDb: string, sessionId: string): SourceSessionState {
    return withStore(contextDb, "read", (store) => {
      const labels = new Set<string>()
      for (const table of [compartments, tags, sessionFacts] as unknown as Keyed[])
        if (store.has(table, ["session_id", "harness"]))
          for (const row of store.orm
            .selectDistinct({ harness: (table as unknown as { harness: SQLiteColumn }).harness })
            .from(table)
            .where(eq(table.session_id, sessionId))
            .all())
            labels.add(String(row.harness))
      const harness: Harness | null = labels.has("opencode2") ? "opencode2" : labels.has("opencode") ? "opencode" : null
      return {
        harness,
        anchors: harness === null ? [] : anchorsOf(store, sessionId, harness),
        project: recordedProjectOf(store, sessionId, harness),
        reach: harness === null ? 0 : reachOf(store, sessionId, harness),
      }
    })
  }

  recordedProject(contextDb: string, sessionId: string): string | null {
    return withStore(contextDb, "read", (store) => recordedProjectOf(store, sessionId, null))
  }

  busy(contextDb: string, sessionId: string, now: number): boolean {
    return withStore(contextDb, "read", (store) => {
      if (store.has(compartmentStateLease, ["session_id", "expires_at"])) {
        const lease = store.orm.select({ until: max(compartmentStateLease.expires_at) }).from(compartmentStateLease).where(eq(compartmentStateLease.session_id, sessionId)).get()
        if (lease?.until !== null && lease?.until !== undefined && Number(lease.until) > now) return true
      }
      if (!store.has(sessionMeta, ["session_id", "wrapup_in_progress_state"])) return false
      const rows = store.orm.select({ state: sessionMeta.wrapup_in_progress_state }).from(sessionMeta).where(eq(sessionMeta.session_id, sessionId)).all()
      return rows.some((row) => wrapupRunning(row.state, now))
    })
  }

  authorityManaged(contextDb: string, project: string): boolean {
    return withStore(contextDb, "read", (store) => isManaged(store, store.orm, project))
  }

  copySessions(sourceDb: string, targetDb: string, copies: readonly PlannedCopy[], options: CopyOptions): CopyOutcome {
    if (copies.length === 0 && options.projects.length === 0 && !options.userMemories) return { sessions: [], projects: [], user_memories_copied: 0 }
    const source = openStore(sourceDb, "read")
    try {
      return withStore(targetDb, "write", (target) => {
        assertKnown(source)
        assertKnown(target)
        return target.transaction((orm) => {
          const writer = new Writer(source, target, orm, options.now)
          const sessions = copies.map((planned) => writer.copy(planned, options.originatedMemories))
          const projects = options.projects.map((merge) => writer.mergeProject(merge))
          const user = options.userMemories ? writer.userMemories(options.projects[0]?.rewriter ?? null) : 0
          return { sessions, projects, user_memories_copied: user }
        })
      })
    } finally {
      source.close()
    }
  }

  stateOf(contextDb: string, sessionId: string): StoredSessionState {
    return withStore(contextDb, "read", (store) => {
      const counted = (table: Keyed, extra?: SQL) =>
        store.has(table, ["session_id"]) ? (store.orm.select({ n: count() }).from(table).where(and(eq(table.session_id, sessionId), extra)).get()?.n ?? 0) : 0
      return {
        compartments: counted(compartments as unknown as Keyed),
        tags: counted(tags as unknown as Keyed),
        notes: store.has(notes, ["session_id", "type"]) ? counted(notes as unknown as Keyed, eq(notes.type, "session")) : 0,
        anchors: anchorsOf(store, sessionId, null),
      }
    })
  }

  health(contextDb: string): StoreHealth {
    return withStore(contextDb, "read", (store) => ({
      integrity_ok: store.integrity().every((line) => line === "ok"),
      foreign_keys_ok: store.foreignKeyViolations() === 0,
    }))
  }
}

/** Refuses a store holding data the Magic Context schema does not describe. */
function assertKnown(store: Store): void {
  const unknown: string[] = []
  for (const table of READ) {
    if (!store.has(table)) continue
    const known = new Set(Object.keys(getTableColumns(table)))
    for (const column of store.columns(getTableName(table))) if (!known.has(column)) unknown.push(`${getTableName(table)}.${column}`)
  }
  const tables = new Set(Object.keys(TABLES))
  for (const name of store.ordinaryTables()) if (!tables.has(name) && store.columns(name).includes("session_id")) unknown.push(name)
  if (unknown.length > 0) throw new UnknownStoreSchemaError(store.path, unknown)
}

/** Whether Magic Context's own module manages a project's memory here, its guard triggers active. */
function isManaged(store: Store, orm: Orm, project: string): boolean {
  const listed = (table: typeof authorityManagedTable | typeof authorityRepairPending) =>
    store.has(table, ["project_path"]) && orm.select({ p: table.project_path }).from(table).where(eq(table.project_path, project)).get() !== undefined
  if (!listed(authorityManagedTable) && !listed(authorityRepairPending)) return false
  const privilege = store.has(contextPrivilegeState, ["id", "enabled"])
    ? orm.select({ enabled: contextPrivilegeState.enabled }).from(contextPrivilegeState).where(eq(contextPrivilegeState.id, 1n)).get()
    : undefined
  return Number(privilege?.enabled ?? 0) === 0
}

/** One transaction's writes into the target from the source. */
class Writer {
  constructor(
    private readonly source: Store,
    private readonly target: Store,
    private readonly orm: Orm,
    private readonly now: number,
  ) {}

  copy({ copy, rewriter }: PlannedCopy, originatedMemories: boolean): CopyResult {
    const { id, sourceHarness, targetHarness, targetProject } = copy
    const text = new Text(rewriter)
    const both = (table: SQLiteTable) => this.source.has(table) && this.target.has(table)
    for (const table of CLEARED.filter((candidate) => this.target.has(candidate, ["session_id"]))) this.orm.delete(table).where(eq(table.session_id, id)).run()
    if (this.target.has(notes, ["session_id", "type"])) this.orm.delete(notes).where(and(eq(notes.session_id, id), eq(notes.type, "session"))).run()

    const rows = (table: Keyed, extra?: SQL, order?: SQLiteColumn) => {
      const query = this.source.orm
        .select(this.source.selection(table))
        .from(table)
        .where(and(eq(table.session_id, id), "harness" in getTableColumns(table) ? eq((table as unknown as { harness: SQLiteColumn }).harness, sourceHarness) : undefined, extra))
      return (order === undefined ? query.all() : query.orderBy(asc(order)).all()) as Row[]
    }
    const fixed = { session_id: id, harness: targetHarness }

    const compartmentIds = new Map<bigint, bigint>()
    for (const row of both(compartments) ? rows(compartments as unknown as Keyed, undefined, compartments.sequence) : [])
      compartmentIds.set(row["id"] as bigint, this.insert(compartments, text.row(row), fixed))
    if (both(compartmentChunkEmbeddings))
      for (const row of rows(compartmentChunkEmbeddings as unknown as Keyed)) {
        const compartment = compartmentIds.get(row["compartment_id"] as bigint)
        if (compartment !== undefined) this.insert(compartmentChunkEmbeddings, text.row(row), { ...fixed, compartment_id: compartment, project_path: targetProject })
      }
    for (const table of PLAIN.filter(both)) for (const row of rows(table)) this.insert(table, text.row(row), fixed)
    let noteCount = 0
    if (both(notes))
      for (const row of rows(notes as unknown as Keyed, eq(notes.type, "session"))) {
        this.insert(notes, text.row(row), { ...fixed, project_path: row["project_path"] === null ? null : targetProject })
        noteCount++
      }
    if (both(compartmentEvents))
      for (const row of rows(compartmentEvents as unknown as Keyed)) {
        const compartment = row["compartment_id"] === null ? null : (compartmentIds.get(row["compartment_id"] as bigint) ?? null)
        this.insert(compartmentEvents, text.row(row), { ...fixed, compartment_id: compartment })
      }
    const history = this.history(id, fixed, targetProject, compartmentIds, text, rows)

    const tagStats = this.orm.select({ n: count(), last: max(tags.tag_number) }).from(tags).where(eq(tags.session_id, id)).get()!
    this.bookkeeping(id, targetHarness, targetProject, Number(tagStats.last ?? 0n))
    const memoryCounts =
      originatedMemories && copy.sourceProject !== null && !isManaged(this.target, this.orm, targetProject)
        ? this.memories(copy.sourceProject, targetProject, text, eq(memories.source_session_id, id))
        : { copied: 0, existing: 0, verifications: 0 }
    if (memoryCounts.copied > 0) this.bumpEpoch(targetProject)
    return {
      id,
      compartments: compartmentIds.size,
      tags: tagStats.n,
      notes: noteCount,
      memories_copied: memoryCounts.copied,
      memories_already_there: memoryCounts.existing,
      history_rows: history,
      residual_windows_paths: text.residual,
    }
  }

  /** Historian runs, subagent invocations and the candidates the historian proposed, their links re-pointed. */
  private history(
    id: string,
    fixed: Row,
    targetProject: string,
    compartmentIds: ReadonlyMap<bigint, bigint>,
    text: Text,
    rows: (table: Keyed, extra?: SQL, order?: SQLiteColumn) => Row[],
  ): number {
    const both = (table: SQLiteTable) => this.source.has(table) && this.target.has(table)
    let written = 0
    const invocations = new Map<bigint, bigint>()
    if (both(subagentInvocations))
      for (const row of rows(subagentInvocations as unknown as Keyed, undefined, subagentInvocations.id)) {
        const parent = row["parent_invocation_id"] === null ? null : (invocations.get(row["parent_invocation_id"] as bigint) ?? null)
        invocations.set(row["id"] as bigint, this.insert(subagentInvocations, text.row(row), { ...fixed, parent_invocation_id: parent }))
        written++
      }
    if (both(historianRuns))
      for (const row of rows(historianRuns as unknown as Keyed, undefined, historianRuns.id)) {
        const mapped = (key: string) => (row[key] === null ? null : (compartmentIds.get(row[key] as bigint) ?? null))
        const invocation = row["subagent_invocation_id"] === null ? null : (invocations.get(row["subagent_invocation_id"] as bigint) ?? null)
        this.insert(historianRuns, text.row(row), { ...fixed, compartment_id_min: mapped("compartment_id_min"), compartment_id_max: mapped("compartment_id_max"), subagent_invocation_id: invocation })
        written++
      }
    if (both(primerCandidates))
      for (const row of rows(primerCandidates as unknown as Keyed)) {
        this.insert(primerCandidates, text.row(row), { ...fixed, project_path: targetProject })
        written++
      }
    if (both(userMemoryCandidates))
      for (const row of rows(userMemoryCandidates as unknown as Keyed)) {
        this.insert(userMemoryCandidates, text.row(row), { session_id: id })
        written++
      }
    return written
  }

  /** The session's own bookkeeping: its project, its summary version, and dropped caches. */
  private bookkeeping(id: string, harness: Harness, project: string, lastTag: number): void {
    const now = BigInt(this.now)
    if (this.target.has(sessionProjects)) {
      this.orm.delete(sessionProjects).where(and(eq(sessionProjects.session_id, id), ne(sessionProjects.harness, harness))).run()
      this.target.insert(this.orm, sessionProjects, { session_id: id, harness, project_path: project, updated_at: now }, { target: ["session_id", "harness"], set: ["project_path", "updated_at"] })
    }
    if (this.target.has(sessionMeta)) {
      const existing = this.orm.select({ counter: sessionMeta.counter }).from(sessionMeta).where(eq(sessionMeta.session_id, id)).get()
      if (existing === undefined) this.target.insert(this.orm, sessionMeta, { session_id: id, harness, counter: BigInt(lastTag) })
      else {
        // As Magic Context's own session move does: drop the two cached context snapshots.
        const counter = existing.counter === null || existing.counter < BigInt(lastTag) ? BigInt(lastTag) : existing.counter
        this.orm.update(sessionMeta).set({ cached_m0_bytes: null, cached_m1_bytes: null, counter }).where(eq(sessionMeta.session_id, id)).run()
      }
    }
    if (this.target.has(compartmentHistoryVersions)) {
      const existing = this.orm.select({ version: compartmentHistoryVersions.version }).from(compartmentHistoryVersions).where(eq(compartmentHistoryVersions.session_id, id)).get()
      if (existing === undefined) this.target.insert(this.orm, compartmentHistoryVersions, { session_id: id, version: 1n })
      else
        this.orm
          .update(compartmentHistoryVersions)
          .set({ version: (existing.version ?? 0n) + 1n, generation: randomBytes(16).toString("hex") })
          .where(eq(compartmentHistoryVersions.session_id, id))
          .run()
    }
  }

  /**
   * Memories of `from` (those `filter` selects; injectable ones only, as Magic Context's own copy
   * takes) inserted under `to` with their embeddings and verifications; one Magic Context already
   * holds there (same category and normalized text) is kept.
   */
  private memories(from: string, to: string, text: Text, filter?: SQL): { copied: number; existing: number; verifications: number } {
    if (!this.source.has(memories) || !this.target.has(memories)) return { copied: 0, existing: 0, verifications: 0 }
    const rows = this.source.orm
      .select(this.source.selection(memories))
      .from(memories)
      .where(and(eq(memories.project_path, from), inArray(memories.status, INJECTABLE), filter))
      .orderBy(asc(memories.id))
      .all() as Row[]
    let copied = 0
    let verifications = 0
    for (const row of rows) {
      const content = text.cell(row["content"], "content") as string
      const hash = normalizedHash(content)
      // Magic Context's key (`UNIQUE(project_path, category, normalized_hash)`): one already there is kept.
      const existing = this.orm
        .select({ id: memories.id })
        .from(memories)
        .where(and(eq(memories.project_path, to), eq(memories.category, String(row["category"])), eq(memories.normalized_hash, hash)))
        .get()
      if (existing !== undefined) continue
      const inserted = this.target.insert(this.orm, memories, { ...text.row(row), id: undefined, project_path: to, content, normalized_hash: hash, superseded_by_memory_id: null })
      copied++
      const sourceId = row["id"] as bigint
      // An embedding describes the text it was made from; a rewritten memory is embedded again by Magic Context.
      if (content === row["content"] && this.source.has(memoryEmbeddings) && this.target.has(memoryEmbeddings))
        for (const embedding of this.source.orm.select(this.source.selection(memoryEmbeddings)).from(memoryEmbeddings).where(eq(memoryEmbeddings.memory_id, sourceId)).all() as Row[])
          this.target.insert(this.orm, memoryEmbeddings, { ...embedding, memory_id: inserted.lastInsertRowid }, { ignore: true })
      if (this.source.has(memoryVerifications) && this.target.has(memoryVerifications))
        for (const verification of this.source.orm.select(this.source.selection(memoryVerifications)).from(memoryVerifications).where(eq(memoryVerifications.memory_id, sourceId)).all() as Row[]) {
          this.target.insert(this.orm, memoryVerifications, { ...text.row(verification), memory_id: inserted.lastInsertRowid }, { ignore: true })
          verifications++
        }
    }
    return { copied, existing: rows.length - copied, verifications }
  }

  /** A source project's state merged into its target project: memories, notes, primers, the dreamer's history. */
  mergeProject(merge: ProjectMerge): ProjectMergeResult {
    const empty = { from: merge.from, to: merge.to, memories_copied: 0, memories_already_there: 0, verifications: 0, notes: 0, primers: 0, dream_runs: 0, retrospective_windows: 0 }
    if (isManaged(this.target, this.orm, merge.to)) return { ...empty, skipped: "authority-managed" }
    const text = new Text(merge.rewriter)
    const memoryCounts = this.memories(merge.from, merge.to, text)

    let noteCount = 0
    if (this.source.has(notes) && this.target.has(notes)) {
      const known = new Set(
        this.orm
          .select({ type: notes.type, content: notes.content })
          .from(notes)
          .where(and(eq(notes.project_path, merge.to), ne(notes.type, "session")))
          .all()
          .map((row) => `${row.type}\u0000${row.content}`),
      )
      for (const row of this.source.orm.select(this.source.selection(notes)).from(notes).where(and(eq(notes.project_path, merge.from), ne(notes.type, "session"))).orderBy(asc(notes.id)).all() as Row[]) {
        const rewritten = text.row(row)
        const key = `${String(row["type"])}\u0000${String(rewritten["content"])}`
        if (known.has(key)) continue
        known.add(key)
        this.insert(notes, rewritten, { project_path: merge.to })
        noteCount++
      }
    }

    let primerCount = 0
    if (this.source.has(primers) && this.target.has(primers)) {
      const known = new Set(this.orm.select({ question: primers.question }).from(primers).where(eq(primers.project_path, merge.to)).all().map((row) => String(row.question)))
      for (const row of this.source.orm.select(this.source.selection(primers)).from(primers).where(eq(primers.project_path, merge.from)).orderBy(asc(primers.id)).all() as Row[]) {
        const rewritten = text.row(row)
        if (known.has(String(rewritten["question"]))) continue
        known.add(String(rewritten["question"]))
        this.insert(primers, rewritten, { project_path: merge.to })
        primerCount++
      }
    }

    let dreamCount = 0
    if (this.source.has(dreamRuns) && this.target.has(dreamRuns)) {
      const known = new Set(this.orm.select({ at: dreamRuns.started_at, holder: dreamRuns.holder_id }).from(dreamRuns).where(eq(dreamRuns.project_path, merge.to)).all().map((row) => `${row.at}\u0000${row.holder}`))
      for (const row of this.source.orm.select(this.source.selection(dreamRuns)).from(dreamRuns).where(eq(dreamRuns.project_path, merge.from)).orderBy(asc(dreamRuns.id)).all() as Row[]) {
        if (known.has(`${row["started_at"]}\u0000${row["holder_id"]}`)) continue
        this.insert(dreamRuns, text.row(row), { project_path: merge.to })
        dreamCount++
      }
    }

    let windows = 0
    if (this.source.has(retrospectiveProcessedWindows) && this.target.has(retrospectiveProcessedWindows)) {
      const known = new Set(
        this.orm
          .select({ key: retrospectiveProcessedWindows.window_key })
          .from(retrospectiveProcessedWindows)
          .where(eq(retrospectiveProcessedWindows.project_path, merge.to))
          .all()
          .map((row) => String(row.key)),
      )
      for (const row of this.source.orm
        .select(this.source.selection(retrospectiveProcessedWindows))
        .from(retrospectiveProcessedWindows)
        .where(eq(retrospectiveProcessedWindows.project_path, merge.from))
        .all() as Row[]) {
        if (known.has(String(row["window_key"]))) continue
        this.target.insert(this.orm, retrospectiveProcessedWindows, { ...row, project_path: merge.to })
        windows++
      }
    }

    if (memoryCounts.copied + noteCount + primerCount > 0) this.bumpEpoch(merge.to)
    return {
      ...empty,
      memories_copied: memoryCounts.copied,
      memories_already_there: memoryCounts.existing,
      verifications: memoryCounts.verifications,
      notes: noteCount,
      primers: primerCount,
      dream_runs: dreamCount,
      retrospective_windows: windows,
      skipped: null,
    }
  }

  /** User memories (global, not a project's), each one the target lacks by its text. */
  userMemories(rewriter: TextRewriter | null): number {
    if (!this.source.has(userMemories) || !this.target.has(userMemories)) return 0
    const text = new Text(rewriter)
    const known = new Set(this.orm.select({ content: userMemories.content }).from(userMemories).all().map((row) => String(row.content)))
    let copied = 0
    for (const row of this.source.orm.select(this.source.selection(userMemories)).from(userMemories).orderBy(asc(userMemories.id)).all() as Row[]) {
      const rewritten = text.row(row)
      if (known.has(String(rewritten["content"]))) continue
      known.add(String(rewritten["content"]))
      this.insert(userMemories, rewritten, {})
      copied++
    }
    return copied
  }

  /** Tells Magic Context its project memory changed, so cached prompts are rebuilt. */
  private bumpEpoch(project: string): void {
    if (!this.target.has(projectState)) return
    const now = BigInt(this.now)
    const existing = this.orm.select({ epoch: projectState.project_memory_epoch }).from(projectState).where(eq(projectState.project_path, project)).get()
    if (existing === undefined) this.target.insert(this.orm, projectState, { project_path: project, project_memory_epoch: 1n, project_user_profile_version: 0n, updated_at: now })
    else this.orm.update(projectState).set({ project_memory_epoch: (existing.epoch ?? 0n) + 1n, updated_at: now }).where(eq(projectState.project_path, project)).run()
  }

  /** Inserts a source row without its `id`, the fixed values over it; returns the new row id. */
  private insert(table: SQLiteTable, row: Row, fixed: Row): bigint {
    return this.target.insert(this.orm, table, { ...row, id: undefined, ...fixed }).lastInsertRowid
  }
}

/** Rewrites a row's prose (never its keys), counting what still holds a Windows path. */
class Text {
  residual = 0
  constructor(private readonly rewriter: TextRewriter | null) {}

  cell(value: unknown, column: string): unknown {
    if (typeof value !== "string" || KEYS.has(column) || this.rewriter === null) return value
    const rewritten = this.rewriter.rewrite(value)
    if (this.rewriter.residual(rewritten)) this.residual++
    return rewritten
  }

  row(row: Row): Row {
    return Object.fromEntries(Object.entries(row).map(([column, value]) => [column, this.cell(value, column)]))
  }
}

function reachOf(store: Store, sessionId: string, harness: Harness): number {
  if (!store.has(compartments, ["session_id", "harness", "end_message"])) return 0
  const row = store.orm.select({ reach: max(compartments.end_message) }).from(compartments).where(and(eq(compartments.session_id, sessionId), eq(compartments.harness, harness))).get()
  return Number(row?.reach ?? 0n)
}

/** A wrapup marker that has not expired. Magic Context writes it as JSON with `expiresAt`; anything unreadable counts as running. */
function wrapupRunning(state: string | null, now: number): boolean {
  if (state === null || state === "") return false
  try {
    const parsed = JSON.parse(state) as { expiresAt?: unknown }
    return typeof parsed.expiresAt !== "number" || parsed.expiresAt > now
  } catch {
    return true
  }
}

function anchorsOf(store: Store, sessionId: string, harness: Harness | null): string[] {
  if (!store.has(compartments, ["session_id", "harness", "start_message_id", "end_message_id"])) return []
  const rows = store.orm
    .select({ a: compartments.start_message_id, b: compartments.end_message_id })
    .from(compartments)
    .where(and(eq(compartments.session_id, sessionId), harness === null ? undefined : eq(compartments.harness, harness)))
    .all()
  return [...new Set(rows.flatMap((row) => [row.a, row.b]).filter((id): id is string => typeof id === "string" && id !== ""))]
}

/** The project recorded for the session: under its harness when given, preferring the OpenCode 2 label otherwise. */
function recordedProjectOf(store: Store, sessionId: string, harness: Harness | null): string | null {
  if (!store.has(sessionProjects, ["session_id", "harness", "project_path"])) return null
  const rows = store.orm
    .select({ project: sessionProjects.project_path, harness: sessionProjects.harness })
    .from(sessionProjects)
    .where(eq(sessionProjects.session_id, sessionId))
    .orderBy(desc(sessionProjects.harness))
    .all()
  const preferred = harness ?? "opencode2"
  return (rows.find((row) => row.harness === preferred) ?? rows[0])?.project ?? null
}

/** Magic Context's memory key: MD5 of the lower-cased text with runs of white space collapsed (`normalize-hash.ts`). */
export function normalizedHash(content: string): string {
  return createHash("md5").update(content.toLowerCase().replace(/\s+/g, " ").trim()).digest("hex")
}
