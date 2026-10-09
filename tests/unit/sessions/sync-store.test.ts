import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { join } from "node:path"
import type { SessionCopy } from "@session-manager/domain/model/MagicContextSync"
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
    expect(store.sourceState(file("s"), "ses_both")).toEqual({ harness: "opencode2", anchors: ["new", "new2"], project: "dir:new" })
    expect(store.sourceState(file("s"), "ses_v1")).toEqual({ harness: "opencode", anchors: ["m1", "m2"], project: "git:abc" })
    expect(store.sourceState(file("s"), "ses_bare")).toEqual({ harness: null, anchors: [], project: null })
    expect(store.recordedProject(file("s"), "ses_both")).toBe("dir:new")
    expect(store.recordedProject(file("s"), "ses_none")).toBeNull()
  })

  it("reads a store that lacks the tables as empty", () => {
    makeSyncContextStore(file("bare"), { without: ["compartments", "tags", "session_facts", "session_projects", "notes"] })
    expect(store.sourceState(file("bare"), "ses_a")).toEqual({ harness: null, anchors: [], project: null })
    expect(store.recordedProject(file("bare"), "ses_a")).toBeNull()
    expect(store.stateOf(file("bare"), "ses_a")).toEqual({ compartments: 0, tags: 0, notes: 0, anchors: [] })
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

describe("BunMagicContextSyncStoreAdapter.copySessions", () => {
  it("does nothing for no copies", () => {
    expect(store.copySessions(file("missing-source"), file("missing-target"), [])).toEqual([])
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
                   values ('session', 'projectless', 'ses_a', null, 1, 1, 'opencode2')`,
    })
    makeSyncContextStore(file("target"), {
      sessions: {
        ses_a: { harness: "opencode", compartments: [{ start: "old", end: "old" }], tags: 9, notes: ["stale"], project: "dir:target", meta: true },
        ses_b: { compartments: [{ start: "b", end: "b" }], tags: 1, project: "dir:target", memories: [{ content: "already known", from: "ses_b" }] },
      },
      extraSql: "insert into compartment_history_versions (session_id, version) values ('ses_a', 4)",
    })

    const [result] = store.copySessions(file("source"), file("target"), [{ copy: copyOf("ses_a"), rewriter }])
    expect(result).toEqual({
      id: "ses_a",
      compartments: 2,
      tags: 3,
      notes: 2,
      memories_copied: 2,
      memories_already_there: 1,
      residual_windows_paths: 1,
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
    expect(rowsOf(target, "select harness, project_path from session_projects where session_id = 'ses_a'")).toEqual([
      { harness: "opencode2", project_path: "dir:target" },
    ])
    expect(rowsOf(target, "select counter, cached_m0_bytes from session_meta where session_id = 'ses_a'")).toEqual([{ counter: 3, cached_m0_bytes: null }])
    expect(rowsOf(target, "select version from compartment_history_versions where session_id = 'ses_a'")).toEqual([{ version: 5 }])
    const memories = rowsOf(
      target,
      `select m.content, m.normalized_hash as hash, m.source_session_id as source, (select count(*) from memory_embeddings e where e.memory_id = m.id) as embeddings
       from memories m where project_path = 'dir:target' order by m.id`,
    )
    expect(memories).toEqual([
      { content: "already known", hash: normalizedHash("already known"), source: "ses_b", embeddings: 0 },
      { content: "uses /home/me\\repo", hash: normalizedHash("uses /home/me\\repo"), source: "ses_a", embeddings: 0 },
      { content: "plain memory", hash: normalizedHash("plain memory"), source: "ses_a", embeddings: 1 },
    ])
    expect(rowsOf(target, "select project_memory_epoch as epoch from project_state where project_path = 'dir:target'")).toEqual([{ epoch: 1 }])
    expect(store.stateOf(target, "ses_a")).toEqual({ compartments: 2, tags: 3, notes: 2, anchors: ["a-1", "a-2", "a-3", "a-4"] })

    // Again, for a session the target has no bookkeeping for, without a rewriter and without memories.
    const [again] = store.copySessions(file("source"), target, [{ copy: copyOf("ses_a", { sourceProject: null, targetProject: "git:t" }), rewriter: null }])
    expect(again).toMatchObject({ memories_copied: 0, memories_already_there: 0, residual_windows_paths: 0 })
    expect(rowsOf(target, "select content from compartments where session_id = 'ses_a' order by sequence")[0]).toEqual({ content: "worked in C:\\Users\\Me\\repo" })
    expect(rowsOf(target, "select version from compartment_history_versions where session_id = 'ses_a'")).toEqual([{ version: 6 }])
  })

  it("adds the session's bookkeeping when the target has none, and copies an OpenCode 1 session's state under its label", () => {
    makeSyncContextStore(file("source"), { sessions: { ses_v1: { harness: "opencode", compartments: [{ start: "m", end: "m" }], tags: 1 } } })
    makeSyncContextStore(file("target"), {})
    const [result] = store.copySessions(file("source"), file("target"), [
      { copy: copyOf("ses_v1", { sourceHarness: "opencode", targetHarness: "opencode", sourceProject: "dir:nothing" }), rewriter: null },
    ])
    expect(result).toMatchObject({ compartments: 1, tags: 1, memories_copied: 0 })
    expect(rowsOf(file("target"), "select harness, counter from session_meta where session_id = 'ses_v1'")).toEqual([{ harness: "opencode", counter: 1 }])
    expect(rowsOf(file("target"), "select version from compartment_history_versions where session_id = 'ses_v1'")).toEqual([{ version: 1 }])
    expect(rowsOf(file("target"), "select count(*) as n from project_state")).toEqual([{ n: 0 }])
  })

  it("copies only the tables both stores have", () => {
    const optional = ["compartment_chunk_embeddings", "notes", "compartment_events", "session_projects", "session_meta", "compartment_history_versions", "project_state", "memory_embeddings"]
    makeSyncContextStore(file("source"), {
      sessions: { ses_a: { compartments: [{ start: "a", end: "a" }], tags: 1, memories: [{ content: "kept", embedded: true }] } },
      without: ["compartments", "memories"],
    })
    makeSyncContextStore(file("target"), { without: [...optional, "pending_ops"] })
    const [result] = store.copySessions(file("source"), file("target"), [{ copy: copyOf("ses_a"), rewriter: null }])
    expect(result).toMatchObject({ compartments: 0, tags: 1, notes: 0, memories_copied: 0 })
    makeSyncContextStore(file("source2"), { sessions: { ses_a: { tags: 1, memories: [{ content: "embedded", embedded: true }] } } })
    makeSyncContextStore(file("target2"), { without: ["memory_embeddings", "project_state"] })
    expect(store.copySessions(file("source2"), file("target2"), [{ copy: copyOf("ses_a"), rewriter: null }])[0]).toMatchObject({ memories_copied: 1 })
  })

  it("rolls the whole copy back when a write fails", () => {
    makeSyncContextStore(file("source"), { sessions: { ses_a: { tags: 2 } } })
    makeSyncContextStore(file("target"), {
      sessions: { ses_a: { tags: 5 } },
      extraSql: "create trigger refuse after insert on tags when new.tag_number = 2 begin select raise(abort, 'refused by trigger'); end",
    })
    expect(() => store.copySessions(file("source"), file("target"), [{ copy: copyOf("ses_a"), rewriter: null }])).toThrow("refused by trigger")
    expect(rowsOf(file("target"), "select count(*) as n from tags where session_id = 'ses_a'")).toEqual([{ n: 5 }])
  })
})
