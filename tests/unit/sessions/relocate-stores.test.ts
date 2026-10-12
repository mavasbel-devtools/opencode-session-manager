import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { Database } from "bun:sqlite"
import { join } from "node:path"
import { relocationsFromRules } from "@session-manager/domain/services/RelocateRules"
import { PathRewriter } from "@session-manager/domain/services/PathRewriter"
import type { TextRewrite } from "@session-manager/domain/ports/outbound/RelocationStorePort"
import { BunMagicContextRelocationStoreAdapter } from "@session-manager/infrastructure/adapters/outbound/sqlite/BunMagicContextRelocationStoreAdapter"
import { normalizedHash } from "@session-manager/infrastructure/adapters/outbound/sqlite/BunMagicContextSyncStoreAdapter"
import { BunRelocationStoreAdapter } from "@session-manager/infrastructure/adapters/outbound/sqlite/BunRelocationStoreAdapter"
import { openStore, withStore } from "@session-manager/infrastructure/adapters/outbound/sqlite/engine/Store"
import { countMentions, rewriteTable } from "@session-manager/infrastructure/adapters/outbound/sqlite/TextRelocation"
import { project, sessionMessage, todo } from "@session-manager/infrastructure/adapters/outbound/sqlite/schema/opencode"
import { removeTemporary, temporaryWorkspace } from "@test/support/maintenance/temporary"
import { makeOpenCode2Store } from "@test/support/sessions/opencode-stores"
import { makeSyncContextStore, rowsOf } from "@test/support/sessions/sync-stores"

let directory = ""
beforeEach(() => {
  directory = temporaryWorkspace("oc-relocate-store-")
})
afterEach(() => {
  removeTemporary(directory)
})

const relocations = relocationsFromRules([{ from: "/old/rel", to: "/new/rel" }], "/home/me")
const rewrite = (scope: TextRewrite["scope"] = "all"): TextRewrite => ({ rewriter: new PathRewriter(relocations.mapping), hints: relocations.hints, scope })
const query = (file: string, sql: string) => {
  const db = new Database(file, { readonly: true })
  try {
    return db.query(sql).all()
  } finally {
    db.close()
  }
}

function opencodeStore(extraSql = ""): string {
  const file = join(directory, "opencode.db")
  makeOpenCode2Store(file, {
    projects: [{ id: "p_old", worktree: "/old/rel", name: "Old" }],
    sessions: [
      { id: "ses_a", directory: "/old/rel", projectId: "p_old", v1: true, extras: true },
      { id: "ses_child", directory: "/old/rel/sub", projectId: "p_old", parentId: "ses_a" },
      { id: "ses_other", directory: "/elsewhere" },
    ],
    // A message of another session naming the folder, and one naming it in a way no rule rewrites (`zold/rel`).
    extraSql: `update session_message set data = '{"text":"see /old/rel/notes.md"}' where id = 'ses_other-m0';
      update session_message set data = '{"text":"zold/rel"}' where id = 'ses_other-m1';
      ${extraSql}`,
  })
  return file
}

describe("BunRelocationStoreAdapter", () => {
  it("moves session rows of both generations and adds the projects the store lacks", () => {
    const file = opencodeStore()
    const adapter = new BunRelocationStoreAdapter()
    const rows = adapter.moveSessions(
      file,
      [
        { id: "ses_a", directory: "/new/rel", projectId: "p_new", path: null },
        { id: "ses_child", directory: "/new/rel/sub", projectId: "p_new", path: "sub" },
      ],
      [
        { id: "p_new", worktree: "/new/rel", vcs: "git", templateId: "p_old" },
        { id: "p_bare", worktree: "/new/bare", vcs: null, templateId: null },
        { id: "p_old", worktree: "/ignored", vcs: null, templateId: null },
      ],
      5,
    )
    // ses_a has an OpenCode 1 and an OpenCode 2 row.
    expect(rows).toBe(3)
    expect(query(file, "select id, directory, project_id, path from session_v2 order by id")).toEqual([
      { id: "ses_a", directory: "/new/rel", project_id: "p_new", path: null },
      { id: "ses_child", directory: "/new/rel/sub", project_id: "p_new", path: "sub" },
      { id: "ses_other", directory: "/elsewhere", project_id: "global", path: null },
    ])
    expect(query(file, "select directory, project_id from session")).toEqual([{ directory: "/new/rel", project_id: "p_new" }])
    expect(query(file, "select id, worktree, vcs, name, time_created, time_updated from project order by id")).toEqual([
      { id: "global", worktree: "/", vcs: null, name: null, time_created: 1, time_updated: 1 },
      { id: "p_bare", worktree: "/new/bare", vcs: null, name: null, time_created: 5, time_updated: 5 },
      { id: "p_new", worktree: "/new/rel", vcs: "git", name: "Old", time_created: 2, time_updated: 5 },
      { id: "p_old", worktree: "/old/rel", vcs: "git", name: "Old", time_created: 2, time_updated: 2 },
    ])
  })

  it("rewrites every text naming an old folder, keeping keys, session folders, project records and blobs", () => {
    const file = opencodeStore()
    const counts = new BunRelocationStoreAdapter().rewriteText(file, rewrite())
    expect(counts).toEqual({
      rows: { event: 1, kv: 1, message: 1, part: 1, session_inbox: 1, session_message: 5, session_pending: 1, todo: 1 },
      residual: { session_message: 1 },
      kept: { instruction_blob: 1, project: 1 },
    })
    expect(query(file, "select id, data from session_message where session_id = 'ses_other' order by seq")).toEqual([
      { id: "ses_other-m0", data: '{"text":"see /new/rel/notes.md"}' },
      { id: "ses_other-m1", data: '{"text":"zold/rel"}' },
    ])
    expect(query(file, "select data from session_message where id = 'ses_child-m0'")).toEqual([{ data: JSON.stringify({ cwd: "/new/rel/sub", text: "edited /new/rel/sub/file.ts" }) }])
    // The folder of a session row is the move's to set, never the text rewrite's.
    expect(query(file, "select id, directory from session_v2 order by id")).toEqual([
      { id: "ses_a", directory: "/old/rel" },
      { id: "ses_child", directory: "/old/rel/sub" },
      { id: "ses_other", directory: "/elsewhere" },
    ])
    expect(query(file, "select value from instruction_blob")).toEqual([{ value: JSON.stringify({ cwd: "/old/rel" }) }])
  })

  it("in a session scope, rewrites only the rows keyed by those sessions", () => {
    const file = opencodeStore()
    const counts = new BunRelocationStoreAdapter().rewriteText(file, rewrite({ sessions: ["ses_a"] }))
    expect(counts).toEqual({
      rows: { event: 1, kv: 1, message: 1, part: 1, session_inbox: 1, session_message: 2, session_pending: 1, todo: 1 },
      residual: {},
      kept: {},
    })
    expect(query(file, "select data from session_message where id = 'ses_other-m0'")).toEqual([{ data: '{"text":"see /old/rel/notes.md"}' }])
  })
})

describe("TextRelocation and the store engine", () => {
  it("leaves a table without a primary key, a table with only key columns, and rows an adjustment declines", () => {
    const file = opencodeStore(`drop table todo;
      create table todo (session_id text, content text, status text, priority text, position integer, time_created integer, time_updated integer);
      insert into todo values ('ses_a', 'check /old/rel', 'pending', 'high', 0, 1, 1)`)
    withStore(file, "write", (store) => {
      expect(store.primaryKey("todo")).toEqual([])
      expect(store.primaryKey("no_such_table")).toEqual([])
      expect(store.primaryKey("session_message")).toEqual(["id"])
      expect(rewriteTable(store, store.orm, { table: todo, keys: new Set() }, rewrite())).toEqual({ rows: 0, residual: 0, declined: 0 })
      const everyColumn = new Set(store.columns("session_message"))
      expect(rewriteTable(store, store.orm, { table: sessionMessage, keys: everyColumn }, rewrite())).toEqual({ rows: 0, residual: 0, declined: 0 })
      expect(rewriteTable(store, store.orm, { table: sessionMessage, keys: new Set(), adjust: () => null }, rewrite())).toEqual({ rows: 0, residual: 1, declined: 5 })
      expect(countMentions(store, store.orm, project, [])).toBe(0)
      expect(countMentions(store, store.orm, project, relocations.hints)).toBe(1)
      expect(() => store.update(store.orm, project, {}, { name: "x" })).toThrow("project: an update needs a key")
      expect(store.update(store.orm, project, { id: "p_old" }, { name: "Renamed" })).toBe(1)
    })
    const store = openStore(file, "read")
    store.close()
    expect(query(file, "select name from project where id = 'p_old'")).toEqual([{ name: "Renamed" }])
  })
})

function contextStore(without: readonly string[] = []): string {
  const file = join(directory, "context.db")
  makeSyncContextStore(file, {
    format: 95,
    without,
    sessions: {
      ses_a: {
        project: "git:old",
        compartments: [{ start: "a", end: "a", content: "worked in /old/rel/src" }],
        notes: ["open /old/rel/TODO.md"],
        memories: [{ content: "build with /old/rel/make.sh" }, { content: "tests in /old/rel/tests" }, { content: "tests in /new/rel/tests" }],
        meta: true,
      },
      ses_other: { project: "git:other", compartments: [{ start: "b", end: "b", content: "compare with /old/rel" }] },
    },
    ...(without.includes("session_meta") ? {} : { extraSql: `update session_meta set cached_m0_bytes = 'prompt naming /old/rel' where session_id = 'ses_a'` }),
  })
  return file
}

describe("BunMagicContextRelocationStoreAdapter", () => {
  it("links sessions to their new project and clears their cached prompt snapshots", () => {
    const file = contextStore()
    const adapter = new BunMagicContextRelocationStoreAdapter()
    expect(adapter.relink(file, [{ sessionId: "ses_a", project: "git:new" }, { sessionId: "ses_none", project: "git:new" }])).toBe(1)
    expect(adapter.relink(file, [{ sessionId: "ses_a", project: "git:new" }])).toBe(0)
    expect(rowsOf(file, "select session_id, project_path from session_projects order by session_id")).toEqual([
      { session_id: "ses_a", project_path: "git:new" },
      { session_id: "ses_other", project_path: "git:other" },
    ])
    expect(rowsOf(file, "select cached_m0_bytes, cached_m1_bytes from session_meta where session_id = 'ses_a'")).toEqual([{ cached_m0_bytes: null, cached_m1_bytes: null }])
  })

  it("relinks nothing in a store without session projects or session meta", () => {
    expect(new BunMagicContextRelocationStoreAdapter().relink(contextStore(["session_projects", "session_meta"]), [{ sessionId: "ses_a", project: "git:new" }])).toBe(0)
  })

  it("rewrites text, re-keys a memory by its new text, keeps a memory that would repeat another, and clears snapshots", () => {
    const file = contextStore()
    const counts = new BunMagicContextRelocationStoreAdapter().rewriteText(file, rewrite())
    expect(counts).toEqual({
      rows: { compartments: 2, memories: 1, notes: 1, session_meta: 1 },
      residual: {},
      kept: {},
      memory_conflicts: 1,
      snapshots_cleared: 1,
    })
    expect(rowsOf(file, "select content, normalized_hash from memories order by id")).toEqual([
      { content: "build with /new/rel/make.sh", normalized_hash: normalizedHash("build with /new/rel/make.sh") },
      { content: "tests in /old/rel/tests", normalized_hash: normalizedHash("tests in /old/rel/tests") },
      { content: "tests in /new/rel/tests", normalized_hash: normalizedHash("tests in /new/rel/tests") },
    ])
    expect(rowsOf(file, "select cached_m0_bytes from session_meta where session_id = 'ses_a'")).toEqual([{ cached_m0_bytes: null }])
  })

  it("in a session scope, rewrites only tables keyed by those sessions", () => {
    const file = contextStore()
    expect(new BunMagicContextRelocationStoreAdapter().rewriteText(file, rewrite({ sessions: ["ses_other"] }))).toEqual({
      rows: { compartments: 1 },
      residual: {},
      kept: {},
      memory_conflicts: 0,
      snapshots_cleared: 0,
    })
    expect(rowsOf(file, "select content from compartments order by session_id")).toEqual([{ content: "worked in /old/rel/src" }, { content: "compare with /new/rel" }])
  })
})
