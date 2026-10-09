import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { join } from "node:path"
import { UnknownStoreSchemaError } from "@session-manager/domain/errors/UnknownStoreSchemaError"
import type { SessionCopy } from "@session-manager/domain/model/MagicContextSync"
import type { CopyOptions } from "@session-manager/domain/ports/outbound/MagicContextSyncStorePort"
import type { TextRewriter } from "@session-manager/domain/services/PathRewriter"
import { BunMagicContextSyncStoreAdapter, normalizedHash } from "@session-manager/infrastructure/adapters/outbound/sqlite/BunMagicContextSyncStoreAdapter"
import { removeTemporary, temporaryWorkspace } from "@test/support/maintenance/temporary"
import { makeSyncContextStore, rowsOf } from "@test/support/sessions/sync-stores"

let directory = ""
beforeEach(() => {
  directory = temporaryWorkspace("oc-sync-store-")
})
afterEach(() => {
  removeTemporary(directory)
})

const store = new BunMagicContextSyncStoreAdapter()
const file = (name: string) => join(directory, `${name}.db`)

/** Rewrites `C:\Users\Me` to `/home/me`; any `D:\` left counts as a Windows path. */
const rewriter: TextRewriter = {
  rewrite: (text) => text.replaceAll("C:\\Users\\Me", "/home/me"),
  residual: (text) => text.includes("D:\\"),
}

const copyOf = (id: string, extra: Partial<SessionCopy> = {}): SessionCopy => ({
  id,
  sourceHarness: "opencode2",
  targetHarness: "opencode2",
  targetProject: "dir:target",
  sourceProject: "dir:source",
  ...extra,
})

describe("BunMagicContextSyncStoreAdapter reads", () => {
  it("reports a session's state under its OpenCode 2 label first, its summary anchors and its project", () => {
    makeSyncContextStore(file("s"), {
      sessions: {
        ses_both: { harness: "opencode", compartments: [{ start: "old", end: "old" }], project: "dir:old" },
        ses_v1: { harness: "opencode", compartments: [{ start: "m1", end: "" }, { start: "m1", end: "m2" }], project: "git:abc" },
        ses_bare: { project: null },
      },
      extraSql: `insert into compartments (session_id, sequence, start_message, end_message, start_message_id, end_message_id, title, content, created_at, harness)
                 values ('ses_both', 9, 0, 0, 'new', 'new2', 't', 'c', 1, 'opencode2');
                 insert into session_projects values ('ses_both', 'opencode2', 'dir:new', 1)`,
    })
    expect(store.sourceState(file("s"), "ses_both")).toEqual({ harness: "opencode2", anchors: ["new", "new2"], project: "dir:new", reach: 0 })
    expect(store.sourceState(file("s"), "ses_v1")).toEqual({ harness: "opencode", anchors: ["m1", "m2"], project: "git:abc", reach: 1 })
    expect(store.sourceState(file("s"), "ses_bare")).toEqual({ harness: null, anchors: [], project: null, reach: 0 })
    expect(store.recordedProject(file("s"), "ses_both")).toBe("dir:new")
    expect(store.recordedProject(file("s"), "ses_none")).toBeNull()
  })

  it("reads a store that lacks the tables as empty", () => {
    makeSyncContextStore(file("bare"), { without: ["compartments", "tags", "session_facts", "session_projects", "notes"] })
    expect(store.sourceState(file("bare"), "ses_a")).toEqual({ harness: null, anchors: [], project: null, reach: 0 })
    expect(store.recordedProject(file("bare"), "ses_a")).toBeNull()
    expect(store.stateOf(file("bare"), "ses_a")).toEqual({ compartments: 0, tags: 0, notes: 0, anchors: [] })
  })

  it("tells when Magic Context is working on a session: an unexpired lease or wrapup", () => {
    makeSyncContextStore(file("busy"), {
      sessions: { ses_lease: { meta: true }, ses_wrap: { meta: true }, ses_old: { meta: true }, ses_bad: { meta: true }, ses_free: { meta: true } },
      extraSql: `insert into compartment_state_lease (session_id, holder_id, acquired_at, expires_at) values ('ses_lease', 'h', 0, 2000), ('ses_old', 'h', 0, 500);
                 update session_meta set wrapup_in_progress_state = '{"expiresAt":2000}' where session_id = 'ses_wrap';
                 update session_meta set wrapup_in_progress_state = '{"expiresAt":500}' where session_id = 'ses_old';
                 update session_meta set wrapup_in_progress_state = 'not json' where session_id = 'ses_bad';
                 update session_meta set wrapup_in_progress_state = '' where session_id = 'ses_free';`,
    })
    expect(["ses_lease", "ses_wrap", "ses_old", "ses_bad", "ses_free", "ses_none"].map((id) => store.busy(file("busy"), id, 1000))).toEqual([
      true,
      true,
      false,
      true,
      false,
      false,
    ])
    makeSyncContextStore(file("bare-busy"), { without: ["compartment_state_lease", "session_meta"] })
    expect(store.busy(file("bare-busy"), "ses_a", 1000)).toBe(false)
    makeSyncContextStore(file("old-meta"), { without: ["compartment_state_lease"], extraSql: "alter table session_meta drop column wrapup_in_progress_state" })
    expect(store.busy(file("old-meta"), "ses_a", 1000)).toBe(false)
  })

  it("checks a store's integrity and foreign keys", () => {
    makeSyncContextStore(file("ok"), { sessions: { ses_a: { compartments: [{ start: "a", end: "b" }], extras: true } } })
    expect(store.health(file("ok"))).toEqual({ integrity_ok: true, foreign_keys_ok: true })
    makeSyncContextStore(file("dangling"), {
      extraSql: `insert into compartment_chunk_embeddings (compartment_id, session_id, project_path, start_ordinal, end_ordinal, chunk_hash, model_id, dims, vector, created_at)
                 values (999, 'ses_a', 'p', 0, 1, 'h', 'm', 1, x'00', 1)`,
    })
    expect(store.health(file("dangling"))).toEqual({ integrity_ok: true, foreign_keys_ok: false })
  })

  it("hashes memory text the way Magic Context does", () => {
    expect(normalizedHash("  Hello\n\tWORLD ")).toBe(new Bun.CryptoHasher("md5").update("hello world").digest("hex"))
  })
})

const SESSIONS = { originatedMemories: true, projects: [], userMemories: false, now: 77 } as const
const copyOne = (source: string, target: string, copy: SessionCopy, rewrite: TextRewriter | null = null, options: Partial<CopyOptions> = {}) =>
  store.copySessions(source, target, [{ copy, rewriter: rewrite }], { ...SESSIONS, ...options })

describe("BunMagicContextSyncStoreAdapter.copySessions", () => {
  it("does nothing for nothing to copy", () => {
    expect(store.copySessions(file("missing-source"), file("missing-target"), [], SESSIONS)).toEqual({ sessions: [], projects: [], user_memories_copied: 0 })
  })

  it("replaces a session's state, maps ids and labels, rewrites text and merges the memories it created", () => {
    makeSyncContextStore(file("source"), {
      sessions: {
        ses_a: {
          compartments: [{ start: "a-1", end: "a-2", content: "worked in C:\\Users\\Me\\repo" }, { start: "a-3", end: "a-4", content: "then D:\\data" }],
          tags: 3,
          notes: ["note about C:\\Users\\Me"],
          facts: ["a fact"],
          extras: true,
          meta: true,
          memories: [
            { content: "uses C:\\Users\\Me\\repo", embedded: true },
            { content: "plain memory", embedded: true },
            { content: "already known" },
            { content: "archived one", status: "archived" },
            { content: "someone else's", from: "ses_other" },
          ],
        },
      },
      extraSql: `insert into compartments (session_id, sequence, start_message, end_message, start_message_id, end_message_id, title, content, created_at, harness)
                   values ('ses_a', 50, 0, 0, 'x', 'x', 't', 'other label', 1, 'opencode');
                 insert into compartment_chunk_embeddings (compartment_id, session_id, project_path, harness, start_ordinal, end_ordinal, chunk_hash, model_id, dims, vector, created_at)
                   values ((select id from compartments where sequence = 50), 'ses_a', 'p', 'opencode2', 0, 1, 'h', 'm2', 1, x'00', 1);
                 insert into compartment_events (session_id, compartment_id, kind, created_at, harness)
                   values ('ses_a', (select id from compartments where sequence = 50), 'other', 1, 'opencode2');
                 insert into notes (type, content, session_id, project_path, created_at, updated_at, harness)
                   values ('session', 'projectless', 'ses_a', null, 1, 1, 'opencode2');
                 insert into memory_verifications (memory_id, file_path, verified_at, mapped_at) values ((select id from memories where content like 'uses%'), 'C:\\Users\\Me\\repo\\a.ts', 1, 1)`,
    })
    makeSyncContextStore(file("target"), {
      sessions: {
        ses_a: { harness: "opencode", compartments: [{ start: "old", end: "old" }], tags: 9, notes: ["stale"], project: "dir:target", meta: true },
        ses_b: { compartments: [{ start: "b", end: "b" }], tags: 1, project: "dir:target", memories: [{ content: "already known", from: "ses_b" }] },
      },
    })
    const before = Number(rowsOf(file("target"), "select version from compartment_history_versions where session_id = 'ses_a'")[0]!["version"])

    const outcome = copyOne(file("source"), file("target"), copyOf("ses_a"), rewriter)
    expect(outcome).toEqual({
      sessions: [{ id: "ses_a", compartments: 2, tags: 3, notes: 2, memories_copied: 2, memories_already_there: 1, history_rows: 0, residual_windows_paths: 1 }],
      projects: [],
      user_memories_copied: 0,
    })
    const target = file("target")
    expect(rowsOf(target, "select harness, content, start_message_id from compartments where session_id = 'ses_a' order by sequence")).toEqual([
      { harness: "opencode2", content: "worked in /home/me\\repo", start_message_id: "a-1" },
      { harness: "opencode2", content: "then D:\\data", start_message_id: "a-3" },
    ])
    expect(rowsOf(target, "select count(*) as n from compartments where session_id = 'ses_b'")).toEqual([{ n: 1 }])
    expect(
      rowsOf(
        target,
        `select e.project_path as p, c.sequence as s from compartment_chunk_embeddings e join compartments c on c.id = e.compartment_id where e.session_id = 'ses_a' order by s`,
      ),
    ).toEqual([
      { p: "dir:target", s: 0 },
      { p: "dir:target", s: 1 },
    ])
    expect(
      rowsOf(target, "select kind, compartment_id is null as unlinked from compartment_events where session_id = 'ses_a' order by id").map((row) => [row["kind"], row["unlinked"]]),
    ).toEqual([
      ["created", 0],
      ["created", 0],
      ["note", 1],
      ["other", 1],
    ])
    expect(rowsOf(target, "select count(*) as n, max(tag_number) as last from tags where session_id = 'ses_a'")).toEqual([{ n: 3, last: 3 }])
    expect(rowsOf(target, "select count(*) as n from source_contents where session_id = 'ses_a'")).toEqual([{ n: 3 }])
    expect(rowsOf(target, "select count(*) as n from pending_ops where session_id = 'ses_a'")).toEqual([{ n: 1 }])
    expect(rowsOf(target, "select content, project_path from notes where session_id = 'ses_a' order by id")).toEqual([
      { content: "note about /home/me", project_path: "dir:target" },
      { content: "projectless", project_path: null },
    ])
    expect(rowsOf(target, "select content from session_facts where session_id = 'ses_a'")).toEqual([{ content: "a fact" }])
    expect(rowsOf(target, "select harness, project_path, updated_at from session_projects where session_id = 'ses_a'")).toEqual([
      { harness: "opencode2", project_path: "dir:target", updated_at: 77 },
    ])
    expect(rowsOf(target, "select counter, cached_m0_bytes from session_meta where session_id = 'ses_a'")).toEqual([{ counter: 3, cached_m0_bytes: null }])
    const after = rowsOf(target, "select version, generation from compartment_history_versions where session_id = 'ses_a'")[0]!
    expect(Number(after["version"])).toBeGreaterThan(before)
    expect(after["generation"]).toMatch(/^[0-9a-f]{32}$/)
    const memories = rowsOf(
      target,
      `select m.content, m.normalized_hash as hash, m.source_session_id as source, (select count(*) from memory_embeddings e where e.memory_id = m.id) as embeddings,
              (select group_concat(file_path) from memory_verifications v where v.memory_id = m.id) as verified
       from memories m where project_path = 'dir:target' order by m.id`,
    )
    expect(memories).toEqual([
      { content: "already known", hash: normalizedHash("already known"), source: "ses_b", embeddings: 0, verified: null },
      { content: "uses /home/me\\repo", hash: normalizedHash("uses /home/me\\repo"), source: "ses_a", embeddings: 0, verified: "/home/me\\repo\\a.ts" },
      { content: "plain memory", hash: normalizedHash("plain memory"), source: "ses_a", embeddings: 1, verified: null },
    ])
    expect(rowsOf(target, "select count(*) as n from memories_fts where memories_fts match 'plain'")).toEqual([{ n: 1 }])
    expect(rowsOf(target, "select project_memory_epoch as epoch, updated_at from project_state where project_path = 'dir:target'")).toEqual([{ epoch: 1, updated_at: 77 }])
    expect(store.stateOf(target, "ses_a")).toEqual({ compartments: 2, tags: 3, notes: 2, anchors: ["a-1", "a-2", "a-3", "a-4"] })
    expect(store.health(target)).toEqual({ integrity_ok: true, foreign_keys_ok: true })

    // Again, for a session the target has no bookkeeping for, without a rewriter and without memories.
    const again = copyOne(file("source"), target, copyOf("ses_a", { sourceProject: null, targetProject: "git:t" }))
    expect(again.sessions[0]).toMatchObject({ memories_copied: 0, memories_already_there: 0, residual_windows_paths: 0 })
    expect(rowsOf(target, "select content from compartments where session_id = 'ses_a' order by sequence")[0]).toEqual({ content: "worked in C:\\Users\\Me\\repo" })
    expect(rowsOf(target, "select project_memory_epoch as epoch from project_state where project_path = 'dir:target'")).toEqual([{ epoch: 1 }])
  })

  it("adds the session's bookkeeping when the target has none, and copies an OpenCode 1 session's state under its label", () => {
    makeSyncContextStore(file("source"), { sessions: { ses_v1: { harness: "opencode", compartments: [{ start: "m", end: "m" }], tags: 1 } } })
    makeSyncContextStore(file("target"), { without: ["compartment_history_versions"] })
    const outcome = copyOne(file("source"), file("target"), copyOf("ses_v1", { sourceHarness: "opencode", targetHarness: "opencode", sourceProject: "dir:nothing" }))
    expect(outcome.sessions[0]).toMatchObject({ compartments: 1, tags: 1, memories_copied: 0 })
    expect(rowsOf(file("target"), "select harness, counter from session_meta where session_id = 'ses_v1'")).toEqual([{ harness: "opencode", counter: 1 }])
    expect(rowsOf(file("target"), "select count(*) as n from project_state")).toEqual([{ n: 0 }])

    makeSyncContextStore(file("bare-meta"), { without: ["compartment_history_versions"], extraSql: "drop trigger tags_version_ai" })
    copyOne(file("source"), file("bare-meta"), copyOf("ses_v1", { sourceHarness: "opencode", targetHarness: "opencode" }))
    expect(rowsOf(file("bare-meta"), "select harness, counter from session_meta where session_id = 'ses_v1'")).toEqual([{ harness: "opencode", counter: 1 }])
    makeSyncContextStore(file("history"), { extraSql: "drop trigger compartment_history_ai; drop trigger compartment_history_ad" })
    copyOne(file("source"), file("history"), copyOf("ses_v1", { sourceHarness: "opencode", targetHarness: "opencode" }))
    expect(rowsOf(file("history"), "select version from compartment_history_versions where session_id = 'ses_v1'")).toEqual([{ version: 1 }])
  })

  it("copies the session's history runs, subagent invocations and candidates, their links re-pointed", () => {
    makeSyncContextStore(file("source"), {
      sessions: { ses_h: { compartments: [{ start: "a", end: "a" }, { start: "b", end: "b" }] } },
      extraSql: `insert into subagent_invocations (id, session_id, harness, subagent, started_at, status, parent_invocation_id) values
                   (40, 'ses_h', 'opencode2', 'historian', 1, 'done', null), (41, 'ses_h', 'opencode2', 'historian', 2, 'done', 40), (42, 'ses_h', 'opencode2', 'x', 3, 'done', 999);
                 insert into historian_runs (session_id, harness, subagent_invocation_id, run_kind, status, compartment_id_min, compartment_id_max, created_at) values
                   ('ses_h', 'opencode2', 41, 'incremental', 'success', (select min(id) from compartments), (select max(id) from compartments), 1),
                   ('ses_h', 'opencode2', null, 'incremental', 'failed', null, 12345, 2),
                   ('ses_h', 'opencode2', 777, 'incremental', 'failed', null, null, 3);
                 insert into primer_candidates (project_path, harness, session_id, question, normalized_question, source_message_time, created_at) values ('dir:source', 'opencode2', 'ses_h', 'Where is C:\\Users\\Me?', 'where', 1, 1);
                 insert into user_memory_candidates (content, session_id, created_at) values ('likes tests', 'ses_h', 1)`,
    })
    makeSyncContextStore(file("target"), {
      sessions: { ses_x: { compartments: [{ start: "x", end: "x" }] } },
      extraSql: "insert into historian_runs (session_id, harness, run_kind, status, created_at) values ('ses_h', 'opencode2', 'stale', 'failed', 0)",
    })
    const outcome = copyOne(file("source"), file("target"), copyOf("ses_h"), rewriter)
    expect(outcome.sessions[0]!.history_rows).toBe(8)
    const target = file("target")
    const ids = rowsOf(target, "select id from compartments where session_id = 'ses_h' order by sequence").map((row) => row["id"])
    const invocations = rowsOf(target, "select id, parent_invocation_id as parent from subagent_invocations where session_id = 'ses_h' order by started_at")
    expect(invocations.map((row) => row["parent"])).toEqual([null, invocations[0]!["id"], null])
    expect(rowsOf(target, "select status, subagent_invocation_id as inv, compartment_id_min as lo, compartment_id_max as hi from historian_runs where session_id = 'ses_h' order by created_at")).toEqual([
      { status: "success", inv: invocations[1]!["id"], lo: ids[0], hi: ids[1] },
      { status: "failed", inv: null, lo: null, hi: null },
      { status: "failed", inv: null, lo: null, hi: null },
    ])
    expect(rowsOf(target, "select project_path, question from primer_candidates")).toEqual([{ project_path: "dir:target", question: "Where is /home/me?" }])
    expect(rowsOf(target, "select content from user_memory_candidates where session_id = 'ses_h'")).toEqual([{ content: "likes tests" }])
  })

  it("merges a whole project — memories, notes, primers, the dreamer's runs — and the user memories, once", () => {
    makeSyncContextStore(file("source"), {
      sessions: {
        ses_p: { tags: 1, memories: [{ content: "from this session" }, { content: "from another", from: "ses_elsewhere", embedded: true }] },
      },
      extraSql: `insert into notes (type, content, session_id, project_path, created_at, updated_at, harness) values
                   ('smart', 'watch C:\\Users\\Me\\repo', null, 'dir:source', 1, 1, 'opencode2'), ('smart', 'already there', null, 'dir:source', 1, 1, 'opencode2'),
                   ('smart', 'other project', null, 'dir:other', 1, 1, 'opencode2');
                 insert into primers (project_path, question, answer, status, created_at, updated_at) values ('dir:source', 'How to build?', 'bun run build', 'active', 1, 1), ('dir:source', 'Known?', 'yes', 'active', 1, 1);
                 insert into dream_runs (project_path, started_at, finished_at, holder_id, tasks_json) values ('dir:source', 10, 11, 'h1', '[]'), ('dir:source', 20, 21, 'h2', '[]');
                 insert into retrospective_processed_windows (project_path, window_key, processed_at) values ('dir:source', 'w1', 1), ('dir:source', 'w2', 1);
                 insert into user_memories (content, status, promoted_at, created_at, updated_at) values ('prefers bun', 'active', 1, 1, 1), ('known user fact', 'active', 1, 1, 1)`,
    })
    makeSyncContextStore(file("target"), {
      extraSql: `insert into notes (type, content, session_id, project_path, created_at, updated_at, harness) values ('smart', 'already there', null, 'dir:target', 1, 1, 'opencode2');
                 insert into primers (project_path, question, answer, status, created_at, updated_at) values ('dir:target', 'Known?', 'yes', 'active', 1, 1);
                 insert into dream_runs (project_path, started_at, finished_at, holder_id, tasks_json) values ('dir:target', 20, 21, 'h2', '[]');
                 insert into retrospective_processed_windows (project_path, window_key, processed_at) values ('dir:target', 'w2', 1);
                 insert into user_memories (content, status, promoted_at, created_at, updated_at) values ('known user fact', 'active', 1, 1, 1);
                 insert into project_state (project_path, project_memory_epoch, project_user_profile_version, updated_at) values ('dir:target', 4, 0, 1)`,
    })
    const options = { originatedMemories: false, projects: [{ from: "dir:source", to: "dir:target", rewriter }], userMemories: true }
    const outcome = copyOne(file("source"), file("target"), copyOf("ses_p"), rewriter, options)
    expect(outcome.sessions[0]).toMatchObject({ memories_copied: 0, memories_already_there: 0 })
    expect(outcome.projects).toEqual([
      { from: "dir:source", to: "dir:target", memories_copied: 2, memories_already_there: 0, verifications: 0, notes: 1, primers: 1, dream_runs: 1, retrospective_windows: 1, skipped: null },
    ])
    expect(outcome.user_memories_copied).toBe(1)
    const target = file("target")
    expect(rowsOf(target, "select content, (select count(*) from memory_embeddings e where e.memory_id = m.id) as e from memories m order by id")).toEqual([
      { content: "from this session", e: 0 },
      { content: "from another", e: 1 },
    ])
    expect(rowsOf(target, "select content from notes where type = 'smart' order by id")).toEqual([{ content: "already there" }, { content: "watch /home/me\\repo" }])
    expect(rowsOf(target, "select question from primers order by id")).toEqual([{ question: "Known?" }, { question: "How to build?" }])
    expect(rowsOf(target, "select started_at from dream_runs order by started_at")).toEqual([{ started_at: 10 }, { started_at: 20 }])
    expect(rowsOf(target, "select window_key from retrospective_processed_windows order by window_key")).toEqual([{ window_key: "w1" }, { window_key: "w2" }])
    expect(rowsOf(target, "select content from user_memories order by id")).toEqual([{ content: "known user fact" }, { content: "prefers bun" }])
    expect(rowsOf(target, "select project_memory_epoch as epoch from project_state where project_path = 'dir:target'")).toEqual([{ epoch: 5 }])

    // A second sync finds everything already there.
    const second = copyOne(file("source"), target, copyOf("ses_p"), rewriter, options)
    expect(second.projects[0]).toMatchObject({ memories_copied: 0, memories_already_there: 2, notes: 0, primers: 0, dream_runs: 0, retrospective_windows: 0 })
    expect(second.user_memories_copied).toBe(0)
    expect(rowsOf(target, "select project_memory_epoch as epoch from project_state where project_path = 'dir:target'")).toEqual([{ epoch: 5 }])

    // Without the project tables on one side, there is nothing to merge.
    makeSyncContextStore(file("bare"), { without: ["memories", "notes", "primers", "dream_runs", "retrospective_processed_windows", "user_memories", "project_state"] })
    const bare = copyOne(file("source"), file("bare"), copyOf("ses_p"), null, options)
    expect(bare.projects[0]).toMatchObject({ memories_copied: 0, notes: 0, primers: 0, dream_runs: 0, retrospective_windows: 0, skipped: null })
    expect(bare.user_memories_copied).toBe(0)
  })

  it("leaves alone a project Magic Context's own module manages, unless its privilege is on", () => {
    makeSyncContextStore(file("source"), { sessions: { ses_m: { tags: 1, memories: [{ content: "guarded" }] } } })
    makeSyncContextStore(file("target"), { extraSql: "insert into authority_managed (project_path, context_store_uuid, marked_at) values ('dir:target', 'u', 1)" })
    expect(store.authorityManaged(file("target"), "dir:target")).toBe(true)
    expect(store.authorityManaged(file("target"), "dir:else")).toBe(false)
    const outcome = copyOne(file("source"), file("target"), copyOf("ses_m"), null, { projects: [{ from: "dir:source", to: "dir:target", rewriter: null }] })
    expect(outcome.sessions[0]!.memories_copied).toBe(0)
    expect(outcome.projects[0]!.skipped).toBe("authority-managed")

    makeSyncContextStore(file("repair"), { extraSql: "insert into authority_repair_pending (project_path, started_at) values ('dir:target', 1)" })
    expect(store.authorityManaged(file("repair"), "dir:target")).toBe(true)
    makeSyncContextStore(file("privileged"), {
      extraSql: `insert into authority_managed (project_path, context_store_uuid, marked_at) values ('dir:target', 'u', 1);
                 insert or replace into context_privilege_state (id, enabled) values (1, 1)`,
    })
    expect(store.authorityManaged(file("privileged"), "dir:target")).toBe(false)
    makeSyncContextStore(file("unguarded"), { without: ["authority_managed", "authority_repair_pending", "context_privilege_state"] })
    expect(store.authorityManaged(file("unguarded"), "dir:target")).toBe(false)
    makeSyncContextStore(file("no-privilege"), { without: ["context_privilege_state"], extraSql: "insert into authority_managed (project_path, context_store_uuid, marked_at) values ('dir:target', 'u', 1)" })
    expect(store.authorityManaged(file("no-privilege"), "dir:target")).toBe(true)
  })

  it("refuses a store holding data the schema does not know", () => {
    makeSyncContextStore(file("source"), { sessions: { ses_a: { tags: 1 } }, extraSql: "alter table tags add column invented text" })
    makeSyncContextStore(file("target"), {})
    expect(() => copyOne(file("source"), file("target"), copyOf("ses_a"))).toThrow(new UnknownStoreSchemaError(file("source"), ["tags.invented"]))
    makeSyncContextStore(file("source2"), { sessions: { ses_a: { tags: 1 } } })
    makeSyncContextStore(file("target2"), { extraSql: "create table future_state (session_id text, value text)" })
    expect(() => copyOne(file("source2"), file("target2"), copyOf("ses_a"))).toThrow(/future_state/)
  })

  it("copies only the tables both stores have", () => {
    const optional = ["compartment_chunk_embeddings", "notes", "compartment_events", "session_projects", "session_meta", "compartment_history_versions", "project_state", "memory_embeddings", "memory_verifications"]
    const history = ["historian_runs", "subagent_invocations", "primer_candidates", "user_memory_candidates"]
    makeSyncContextStore(file("source"), {
      sessions: { ses_a: { compartments: [{ start: "a", end: "a" }], tags: 1, memories: [{ content: "kept", embedded: true }] } },
      without: ["compartments", "memories"],
    })
    makeSyncContextStore(file("target"), { without: [...optional, ...history, "pending_ops"] })
    const result = copyOne(file("source"), file("target"), copyOf("ses_a"))
    expect(result.sessions[0]).toMatchObject({ compartments: 0, tags: 1, notes: 0, memories_copied: 0, history_rows: 0 })
    makeSyncContextStore(file("source2"), { sessions: { ses_a: { tags: 1, memories: [{ content: "embedded", embedded: true }] } } })
    makeSyncContextStore(file("target2"), { without: ["memory_embeddings", "memory_verifications", "project_state"] })
    expect(copyOne(file("source2"), file("target2"), copyOf("ses_a")).sessions[0]).toMatchObject({ memories_copied: 1 })
  })

  it("rolls the whole copy back when a write fails", () => {
    makeSyncContextStore(file("source"), { sessions: { ses_a: { tags: 2 } } })
    makeSyncContextStore(file("target"), {
      sessions: { ses_a: { tags: 5 } },
      extraSql: "create trigger refuse after insert on tags when new.tag_number = 2 begin select raise(abort, 'refused by trigger'); end",
    })
    expect(() => copyOne(file("source"), file("target"), copyOf("ses_a"))).toThrow("refused by trigger")
    expect(rowsOf(file("target"), "select count(*) as n from tags where session_id = 'ses_a'")).toEqual([{ n: 5 }])
  })
})
