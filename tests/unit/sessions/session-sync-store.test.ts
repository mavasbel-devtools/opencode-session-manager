import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { Database } from "bun:sqlite"
import { join } from "node:path"
import type { SessionCopyPlan } from "@session-manager/domain/ports/outbound/SessionSyncStorePort"
import type { TextRewriter } from "@session-manager/domain/services/PathRewriter"
import { BunSessionSyncStoreAdapter } from "@session-manager/infrastructure/adapters/outbound/sqlite/BunSessionSyncStoreAdapter"
import { query } from "@test/support/maintenance/repositories"
import { removeTemporary, temporaryWorkspace } from "@test/support/maintenance/temporary"
import { BLOB_HASH, makeOpenCode2Store, MIGRATIONS } from "@test/support/sessions/opencode-stores"

let directory = ""
beforeEach(() => {
  directory = temporaryWorkspace("oc-session-sync-store-")
})
afterEach(() => {
  removeTemporary(directory)
})

const store = new BunSessionSyncStoreAdapter()
const file = (name: string) => join(directory, `${name}.db`)

/** `C:/Users/Me` → `/home/me`; a `D:\` left behind counts as a Windows path. */
const rewriter: TextRewriter = {
  rewrite: (text) => text.replaceAll("C:/Users/Me", "/home/me"),
  residual: (text) => text.includes("D:\\"),
}

function plan(extra: Partial<SessionCopyPlan> = {}): SessionCopyPlan {
  return {
    root: "ses_a",
    sessions: [
      { id: "ses_a", projectId: "p_new", directory: "/home/me/repo", path: null },
      { id: "ses_b", projectId: "p_new", directory: "/home/me/repo/sub", path: "sub" },
    ],
    projects: [
      { id: "p_new", worktree: "/home/me/repo", vcs: "git", templateId: "p_win" },
      { id: "p_bare", worktree: "/home/me/bare", vcs: null, templateId: null },
      { id: "global", worktree: "/", vcs: null, templateId: null },
    ],
    rewriter,
    now: 99,
    ...extra,
  }
}

function makeSource(): void {
  makeOpenCode2Store(file("source"), {
    projects: [{ id: "p_win", worktree: "C:/Users/Me/repo", name: "Repo" }],
    sessions: [
      { id: "ses_a", directory: "C:/Users/Me/repo", projectId: "p_win", entries: ["m0", "m1", "m2"], v1: true, extras: true },
      { id: "ses_b", directory: "C:/Users/Me/repo/sub", projectId: "p_win", parentId: "ses_a", entries: ["b0"] },
      { id: "ses_hidden", directory: "C:/Users/Me", metadata: '{"magic_context":"hidden-run","role":"historian"}' },
      { id: "ses_other_meta", directory: "C:/Users/Me", metadata: '{"magic_context":"visible"}' },
      { id: "ses_bad_meta", directory: "C:/Users/Me", metadata: "{hidden-run" },
    ],
    extraSql: `update session_message set data = '{"note":"D:\\\\data"}' where id = 'm2';
               insert into kv values ('plugin:00ab:fold/v1/ses_a_lookalike', 'x', 1, 1)`,
  })
}

function makeTarget(extraSql?: string): void {
  makeOpenCode2Store(file("target"), {
    projects: [{ id: "p_here", worktree: "/home/me/elsewhere" }],
    sessions: [
      { id: "ses_a", directory: "/home/me/old", projectId: "p_here", entries: ["m0"], v1: true, extras: true },
      { id: "ses_z", directory: "/home/me/z", projectId: "p_here" },
    ],
    ...(extraSql === undefined ? {} : { extraSql }),
  })
}

describe("BunSessionSyncStoreAdapter reads", () => {
  it("reads the format, the projects, plugins' hidden runs and a stored session", () => {
    makeSource()
    expect(store.formatOf(file("source"))).toEqual([...MIGRATIONS])
    expect(store.projects(file("source"))).toEqual([
      { id: "global", worktree: "/" },
      { id: "p_win", worktree: "C:/Users/Me/repo" },
    ])
    expect(store.hiddenRuns(file("source"))).toEqual(["ses_hidden"])
    expect(store.storedSession(file("source"), "ses_a")).toEqual({ projectId: "p_win", directory: "C:/Users/Me/repo", projectExists: true })
    expect(store.storedSession(file("source"), "ses_none")).toBeNull()
  })

  it("reads an OpenCode 1 row, a session whose project is gone, and a store without the tables", () => {
    makeOpenCode2Store(file("v1"), { sessions: [{ id: "ses_old", directory: "/w", v1Only: true, projectId: "gone" }] })
    expect(store.storedSession(file("v1"), "ses_old")).toEqual({ projectId: "gone", directory: "/w", projectExists: false })
    const empty = new Database(file("empty"))
    empty.exec("create table other (x)")
    empty.close()
    expect(store.formatOf(file("empty"))).toEqual([])
    expect(store.projects(file("empty"))).toEqual([])
    expect(store.hiddenRuns(file("empty"))).toEqual([])
    expect(store.storedSession(file("empty"), "ses_a")).toBeNull()
    const sessionsOnly = new Database(file("sessions-only"))
    sessionsOnly.exec("create table session_v2 (id text primary key, project_id text, directory text)")
    sessionsOnly.query("insert into session_v2 values ('ses_x', 'p', '/w')").run()
    sessionsOnly.close()
    expect(store.storedSession(file("sessions-only"), "ses_x")).toEqual({ projectId: "p", directory: "/w", projectExists: false })
  })

  it("checks integrity and foreign keys", () => {
    makeSource()
    expect(store.health(file("source"))).toEqual({ integrity_ok: true, foreign_keys_ok: true })
    const db = new Database(file("source"))
    db.exec("insert into part values ('orphan', 'no-message', 'ses_a', 1, 1, '{}')")
    db.close()
    expect(store.health(file("source"))).toEqual({ integrity_ok: true, foreign_keys_ok: false })
  })
})

describe("BunSessionSyncStoreAdapter.copySessions", () => {
  it("does nothing for no plans", () => {
    expect(store.copySessions(file("missing"), file("missing-too"), [])).toEqual([])
  })

  it("replaces a session family's rows in every session table, rewrites their text and adds the projects they need", () => {
    makeSource()
    makeTarget()
    const [result] = store.copySessions(file("source"), file("target"), [plan()])
    const target = file("target")
    expect(result).toMatchObject({ root: "ses_a", sessions: 2, residual_windows_paths: 1 })
    expect(result!.rows).toBeGreaterThan(15)

    expect(query(target, "select id, project_id, directory, path, title from session_v2 order by id")).toEqual([
      { id: "ses_a", project_id: "p_new", directory: "/home/me/repo", path: null, title: "ses_a" },
      { id: "ses_b", project_id: "p_new", directory: "/home/me/repo/sub", path: "sub", title: "ses_b" },
      { id: "ses_z", project_id: "p_here", directory: "/home/me/z", path: null, title: "ses_z" },
    ])
    expect(query(target, "select id, project_id, directory from session")).toEqual([{ id: "ses_a", project_id: "p_new", directory: "/home/me/repo" }])
    expect(query(target, "select id, seq, data from session_message where session_id = 'ses_a' order by seq")).toEqual([
      { id: "m0", seq: 0, data: '{"cwd":"/home/me/repo","text":"edited /home/me/repo/file.ts"}' },
      { id: "m1", seq: 1, data: '{"cwd":"/home/me/repo","text":"edited /home/me/repo/file.ts"}' },
      { id: "m2", seq: 2, data: '{"note":"D:\\\\data"}' },
    ])
    expect(query(target, "select count(*) as n from session_message where session_id = 'ses_b'")).toEqual([{ n: 1 }])
    expect(query(target, "select aggregate_id, seq from event_sequence order by aggregate_id")).toEqual([{ aggregate_id: "ses_a", seq: 5 }])
    expect(query(target, "select id, seq from event")).toEqual([{ id: "evt_ses_a", seq: 5 }])
    for (const table of ["session_inbox", "session_pending", "instruction_state", "instruction_entry", "message", "part", "todo"])
      expect(query(target, `select count(*) as n from ${table} where session_id = 'ses_a'`)).toEqual([{ n: 1 }])
    expect(query(target, "select content from todo")).toEqual([{ content: "check /home/me/repo" }])
    expect(query(target, "select key, value from kv where key like 'plugin:%' order by key")).toEqual([
      { key: "plugin:00ab:fold/v1/ses_a", value: '{"submitted":"/home/me/repo"}' },
      { key: "plugin:00ab:synthetic/ses_a/msg_1", value: '{"id":"msg_1"}' },
    ])
    expect(query(target, "select hash from instruction_blob")).toEqual([{ hash: BLOB_HASH }])
    expect(query(target, "select id, worktree, vcs, name, time_updated, sandboxes from project order by id")).toEqual([
      { id: "global", worktree: "/", vcs: null, name: null, time_updated: 1, sandboxes: "[]" },
      { id: "p_bare", worktree: "/home/me/bare", vcs: null, name: null, time_updated: 99, sandboxes: "[]" },
      { id: "p_here", worktree: "/home/me/elsewhere", vcs: "git", name: null, time_updated: 2, sandboxes: "[]" },
      { id: "p_new", worktree: "/home/me/repo", vcs: "git", name: "Repo", time_updated: 99, sandboxes: "[]" },
    ])
    expect(store.health(target)).toEqual({ integrity_ok: true, foreign_keys_ok: true })
  })

  it("copies text unchanged without a rewriter, and only into the tables the target has", () => {
    makeSource()
    const db = new Database(file("bare-target"))
    db.exec("create table session_v2 (id text primary key, project_id text, directory text, title text); create table session_message (id text primary key, session_id text, data text)")
    db.close()
    const [result] = store.copySessions(file("source"), file("bare-target"), [plan({ rewriter: null })])
    expect(result).toMatchObject({ sessions: 2, residual_windows_paths: 0 })
    expect(query(file("bare-target"), "select data from session_message where id = 'm0'")).toEqual([
      { data: '{"cwd":"C:/Users/Me/repo","text":"edited C:/Users/Me/repo/file.ts"}' },
    ])
  })

  it("rolls the whole copy back when a write fails", () => {
    makeSource()
    makeTarget("create trigger refuse after insert on session_message when new.id = 'm2' begin select raise(abort, 'refused by trigger'); end")
    expect(() => store.copySessions(file("source"), file("target"), [plan()])).toThrow("refused by trigger")
    expect(query(file("target"), "select directory from session_v2 where id = 'ses_a'")).toEqual([{ directory: "/home/me/old" }])
    expect(query(file("target"), "select count(*) as n from project")).toEqual([{ n: 2 }])
  })
})
