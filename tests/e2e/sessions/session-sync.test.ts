import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { createHash } from "node:crypto"
import { Database } from "bun:sqlite"
import { existsSync, mkdirSync, readdirSync, realpathSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { createTestRenderer, type TestRendererSetup } from "@opentui/core/testing"
import type { RuntimePort } from "@session-manager/domain/ports/outbound/RuntimePort"
import { showBrowser } from "@session-manager/infrastructure/adapters/inbound/manager-tui/OpenTuiBrowser"
import { buildContainer } from "@session-manager/main/cli-container"
import { captureConsole, captureConsoleError } from "@test/support/maintenance/console"
import { fileSha } from "@test/support/maintenance/database"
import { makeRepository, query, sha1 } from "@test/support/maintenance/repositories"
import { removeTemporary, temporaryWorkspace } from "@test/support/maintenance/temporary"
import { makeOpenCode2Store, MIGRATIONS } from "@test/support/sessions/opencode-stores"
import { makeSyncContextStore, rowsOf, type StateSpec } from "@test/support/sessions/sync-stores"
import { waitForText } from "@test/support/sessions/frames"

const STAMP = "2026-10-09-12-00-00"
const NO_IMAGE = "no-such-opencode-image"

let directory = ""
beforeEach(() => {
  directory = realpathSync(temporaryWorkspace("oc-session-sync-e2e-"))
})
afterEach(() => {
  removeTemporary(directory)
})

const at = (...parts: string[]) => join(directory, ...parts)
const opencodeOf = (side: string) => at(side, "opencode", "opencode.db")
const contextOf = (side: string) => at(side, "cortexkit", "magic-context", "context.db")
const backupOf = () => at("linux", "opencode", `sync-backup-${STAMP}`)

function runtime(): RuntimePort {
  mkdirSync(at("tmp"), { recursive: true })
  return {
    pid: () => process.pid,
    platform: () => process.platform,
    now: () => Date.now(),
    stamp: () => STAMP,
    temporaryDirectory: () => at("tmp"),
    homeDirectory: () => at("home"),
  }
}

async function cli(argv: string[]) {
  const out = captureConsole()
  const errors = captureConsoleError()
  try {
    const container = await buildContainer({ OPENCODE_DB_COMPACT_IMAGE: NO_IMAGE }, { runtime: runtime() })
    let code: number
    try {
      code = await container.run(argv)
    } catch (error) {
      errors.lines.push(`ERROR: ${error instanceof Error ? error.message : String(error)}`)
      code = 1
    }
    const text = out.lines.join("\n")
    return { code, json: text.startsWith("{") ? JSON.parse(text) : null, text, errors: errors.lines }
  } finally {
    out.restore()
    errors.restore()
  }
}

const dirIdentity = (path: string) => `dir:${createHash("md5").update(path).digest("hex").slice(0, 12)}`

const compartments = (id: string, count: number) =>
  Array.from({ length: count }, (_, index) => ({ start: `${id}-m${index}`, end: `${id}-m${index}`, content: `summary ${index} of C:\\Users\\Me\\repo` }))

/**
 * A Windows profile (`win`, its sessions under `C:/Users/Me`) and this machine's (`linux`), with
 * this machine's home holding a git repository, a plain folder and a folder a session moved to.
 */
function makeProfiles(options: { sourceMigrations?: readonly string[]; targetContextSql?: string } = {}) {
  const home = at("home")
  makeRepository(join(home, "repo"), { remote: "https://GitHub.com/Ex/Repo.git", commit: true })
  mkdirSync(join(home, "repo", "sub"), { recursive: true })
  mkdirSync(join(home, "plain"), { recursive: true })
  mkdirSync(join(home, "moved", "rep"), { recursive: true })
  makeRepository(join(home, "scp"), { remote: "git@Example.org:team/scp.git", commit: true })

  makeOpenCode2Store(opencodeOf("win"), {
    projects: [
      { id: "p_win_repo", worktree: "C:/Users/Me/repo", name: "Repo" },
      { id: "p_win_gone", worktree: "C:/Users/Me/gone", name: "Gone" },
    ],
    sessions: [
      { id: "ses_new", directory: "C:/Users/Me/repo", projectId: "p_win_repo", v1: true, extras: true },
      { id: "ses_new_child", directory: "C:/Users/Me/repo/sub", projectId: "p_win_repo", parentId: "ses_new" },
      { id: "ses_plain", directory: "C:/Users/Me/plain" },
      { id: "ses_rep", directory: "C:/Users/Me/rep", entries: ["a", "b", "c"], extras: true },
      { id: "ses_same", directory: "C:/Users/Me/plain" },
      { id: "ses_same2", directory: "C:/Users/Me/plain" },
      { id: "ses_busy", directory: "C:/Users/Me/plain" },
      { id: "ses_div", directory: "C:/Users/Me/plain", entries: ["ses_div-m0", "x"] },
      { id: "ses_hidden", directory: "C:/Users/Me", metadata: '{"magic_context":"hidden-run","role":"historian"}' },
      { id: "ses_badmeta", directory: "C:/Users/Me/plain", metadata: "{hidden-run" },
      { id: "ses_v1only", directory: "C:/Users/Me/plain", v1Only: true },
      { id: "ses_gone", directory: "C:/Users/Me/gone/x", projectId: "p_win_gone" },
      { id: "ses_scp", directory: "C:/Users/Me/scp" },
      { id: "ses_deep", directory: "C:/Users/Me/moved/deep/x" },
    ],
    // The form OpenCode stores for a path below the root project, inside nested JSON.
    extraSql: `update session_message set data = '{"title":"Users\\\\Me\\\\plain\\\\a.md"}' where id = 'ses_plain-m1'`,
    ...(options.sourceMigrations === undefined ? {} : { migrations: options.sourceMigrations }),
  })
  makeOpenCode2Store(opencodeOf("linux"), {
    projects: [
      { id: "p_moved", worktree: join(home, "moved") },
      { id: "p_moved_deep", worktree: join(home, "moved", "deep") },
    ],
    sessions: [
      { id: "ses_rep", directory: join(home, "moved", "rep"), projectId: "p_moved", entries: ["a"], extras: true },
      { id: "ses_same", directory: join(home, "plain") },
      { id: "ses_same2", directory: join(home, "plain") },
      { id: "ses_busy", directory: join(home, "plain") },
      { id: "ses_div", directory: join(home, "plain"), entries: ["ses_div-m0", "y"] },
    ],
  })

  const source: Record<string, StateSpec> = {
    ses_new: { compartments: compartments("ses_new", 2), tags: 2, notes: ["see C:\\Users\\Me\\repo"], project: "dir:winrepo" },
    ses_rep: { compartments: [{ start: "a", end: "c" }], tags: 1 },
    ses_same: { compartments: compartments("ses_same", 2), tags: 1 },
    ses_same2: { compartments: compartments("ses_same2", 1), tags: 1 },
    ses_busy: { compartments: compartments("ses_busy", 2), tags: 1 },
  }
  makeSyncContextStore(contextOf("win"), { sessions: source })
  makeSyncContextStore(contextOf("linux"), {
    sessions: {
      ses_same: { compartments: compartments("ses_same", 1), tags: 5, meta: true },
      ses_same2: { compartments: compartments("ses_same2", 2), tags: 5 },
      ses_busy: { compartments: compartments("ses_busy", 1), tags: 5, meta: true },
    },
    extraSql: `update session_meta set wrapup_in_progress_state = '{"expiresAt":1}' where session_id = 'ses_same';
               update session_meta set wrapup_in_progress_state = 'not json' where session_id = 'ses_busy';
               ${options.targetContextSql ?? ""}`,
  })
  return { home, repoId: sha1("git-remote:github.com/Ex/Repo"), plainId: sha1(`directory:${join(home, "plain")}`) }
}

describe("sync (real stores, the wired container)", () => {
  it("rehearses, then copies whole sessions with their Magic Context state, and one rollback restores both stores", async () => {
    const { home, repoId, plainId } = makeProfiles()
    const before = { opencode: fileSha(opencodeOf("linux")), context: fileSha(contextOf("linux")) }
    const sources = { opencode: fileSha(opencodeOf("win")), context: fileSha(contextOf("win")) }

    const dry = await cli(["sync", "--from", at("win"), "--to", at("linux"), "--all", "--dry-run"])
    expect(dry.code).toBe(0)
    expect([fileSha(opencodeOf("linux")), fileSha(contextOf("linux"))]).toEqual([before.opencode, before.context])
    const outcomes = dry.json.sessions.map((session: { id: string; relation: string | null; action: string; reason: string | null; project_source: string | null }) => [
      session.id,
      session.relation,
      session.action,
      session.reason,
      session.project_source,
    ])
    expect(outcomes.sort()).toEqual([
      ["ses_badmeta", "missing", "copy", null, "derived"],
      ["ses_busy", "same", "keep", null, null],
      ["ses_div", "diverged", "skip", "diverged", null],
      ["ses_gone", "missing", "copy", null, "source"],
      ["ses_hidden", null, "skip", "hidden-run", null],
      ["ses_new", "missing", "copy", null, "derived"],
      ["ses_plain", "missing", "copy", null, "derived"],
      ["ses_rep", "source-ahead", "replace", null, "target"],
      ["ses_same", "same", "keep", null, null],
      ["ses_same2", "same", "keep", null, null],
      ["ses_scp", "missing", "copy", null, "derived"],
      ["ses_v1only", "missing", "copy", null, "derived"],
      ["ses_deep", "missing", "copy", null, "target"],
    ].sort())
    const contextOutcome = (id: string) => dry.json.sessions.find((session: { id: string }) => session.id === id).context
    expect([contextOutcome("ses_same").status, contextOutcome("ses_same2").reason, contextOutcome("ses_busy").reason, contextOutcome("ses_new").status]).toEqual([
      "copied",
      "target-further",
      "busy",
      "copied",
    ])

    const run = await cli(["sync", "--from", at("win"), "--to", at("linux"), "--all"])
    expect(run.code).toBe(0)
    expect(run.json.rollback).toBe(`opencode-session-manager rollback ${backupOf()} --db ${opencodeOf("linux")} --db ${contextOf("linux")}`)
    expect([fileSha(opencodeOf("win")), fileSha(contextOf("win"))]).toEqual([sources.opencode, sources.context])
    const target = opencodeOf("linux")
    expect(query(target, "select id, project_id, directory, path from session_v2 where id in ('ses_new', 'ses_new_child', 'ses_plain', 'ses_rep', 'ses_gone') order by id")).toEqual([
      { id: "ses_gone", project_id: "p_win_gone", directory: join(home, "gone", "x"), path: "x" },
      { id: "ses_new", project_id: repoId, directory: join(home, "repo"), path: null },
      { id: "ses_new_child", project_id: repoId, directory: join(home, "repo", "sub"), path: "sub" },
      { id: "ses_plain", project_id: plainId, directory: join(home, "plain"), path: null },
      { id: "ses_rep", project_id: "p_moved", directory: join(home, "moved", "rep"), path: "rep" },
    ])
    expect(query(target, "select project_id, directory from session where id = 'ses_v1only'")).toEqual([{ project_id: plainId, directory: join(home, "plain") }])
    expect(query(target, "select project_id, path from session_v2 where id in ('ses_scp', 'ses_deep') order by id")).toEqual([
      { project_id: "p_moved_deep", path: "x" },
      { project_id: sha1("git-remote:example.org/team/scp"), path: null },
    ])
    expect(query(target, "select data from session_message where id = 'ses_plain-m1'")).toEqual([{ data: `{"title":"${home.slice(1)}/plain/a.md"}` }])
    expect(query(target, "select data from session_message where session_id = 'ses_rep' order by seq")[2]).toEqual({
      data: JSON.stringify({ cwd: join(home, "moved", "rep"), text: `edited ${join(home, "moved", "rep")}/file.ts` }),
    })
    expect(query(target, "select id, worktree, name from project where id in (?, 'p_win_gone') order by name", repoId)).toEqual([
      { id: "p_win_gone", worktree: join(home, "gone"), name: "Gone" },
      { id: repoId, worktree: join(home, "repo"), name: "Repo" },
    ])
    expect(query(target, "select count(*) as n from kv where key like '%/ses_new%'")).toEqual([{ n: 2 }])

    const context = contextOf("linux")
    expect(rowsOf(context, "select count(*) as n from compartments where session_id = 'ses_new'")).toEqual([{ n: 2 }])
    expect(rowsOf(context, "select content from compartments where session_id = 'ses_new' order by sequence")[0]).toEqual({ content: `summary 0 of ${home}/repo` })
    expect(rowsOf(context, "select count(*) as n from compartments where session_id = 'ses_same'")).toEqual([{ n: 2 }])
    expect(rowsOf(context, "select count(*) as n from tags where session_id = 'ses_same2'")).toEqual([{ n: 5 }])
    expect(rowsOf(context, "select project_path from session_projects where session_id = 'ses_new'")).toEqual([{ project_path: expect.stringMatching(/^git:[0-9a-f]{40}$/) }])

    const rollback = await cli(["rollback", backupOf(), "--db", target, "--db", context])
    expect(rollback.code).toBe(0)
    expect([fileSha(target), fileSha(context)]).toEqual([before.opencode, before.context])
    const missing = await cli(["rollback", backupOf(), "--db", target, "--db", at("nowhere", "x.db")])
    expect(missing.errors[0]).toContain("no original database")
  })

  it("syncs named sessions only, and only the OpenCode store when one side has no Magic Context", async () => {
    makeProfiles()
    removeTemporary(at("linux", "cortexkit"))
    const run = await cli(["sync", "--from", at("win"), "--to", at("linux"), "--session", "ses_plain", "--session", "ses_nowhere", "--prefer", "keep"])
    expect(run.code).toBe(0)
    expect(run.json).toMatchObject({ target_context_db: null, sessions: [{ id: "ses_plain", action: "copy" }, { id: "ses_nowhere", reason: "not-on-source" }] })
    expect(run.json.rollback).toBe(`opencode-session-manager rollback ${backupOf()} --db ${opencodeOf("linux")}`)
  })

  it("refuses a held target, different OpenCode formats, rules it cannot apply and bad arguments", async () => {
    makeProfiles({ sourceMigrations: [...MIGRATIONS, "20261001000000_newer"] })
    const newer = await cli(["sync", "--from", at("win"), "--to", at("linux"), "--all"])
    expect(newer.errors[0]).toContain("is at OpenCode migration 20261001000000_newer")
    removeTemporary(directory)
    directory = realpathSync(temporaryWorkspace("oc-session-sync-e2e-"))

    makeProfiles()
    const holder = new Database(opencodeOf("linux"))
    try {
      expect((await cli(["sync", "--from", at("win"), "--to", at("linux"), "--all"])).errors[0]).toContain("is held open by")
    } finally {
      holder.close()
    }
    const several = await cli(["sync", "--from", at("win"), "--to", at("linux"), "--all", "--map", "C:\\Users\\Other\\x=/y"])
    expect(several.errors[0]).toContain("several Windows profiles")
    const deeper = await cli(["sync", "--from", at("win"), "--to", at("linux"), "--all", "--map", "D:\\Users\\Me=/h", "--map", "C:\\Users\\Me\\x=/y"])
    expect(deeper.errors[0]).toContain("map the Windows profile it is in as well")
    const relative = await cli(["sync", "--from", at("win"), "--to", at("linux"), "--all", "--map", "rel/x=/y"])
    expect(relative.errors[0]).toContain("the source folder must be absolute")
    const rules = await cli(["sync", "--from", at("win"), "--to", at("linux"), "--all", "--dry-run", "--map", "C:\\Users\\Me=/srv/me", "--map", "C:\\Users\\Me\\plain=/srv/plain", "--map", "/srv/me/repo=/srv/repo"])
    expect(rules.json.sessions.find((session: { id: string }) => session.id === "ses_plain").target_directory).toBe("/srv/plain")
    expect(rules.json.sessions.find((session: { id: string }) => session.id === "ses_new").target_directory).toBe("/srv/repo")
    const usage = await cli(["sync", "--from", at("win")])
    expect([usage.code, usage.text]).toEqual([
      2,
      "usage: opencode-session-manager sync --from <dataHome> --to <dataHome> [--map <from>=<to>]... (--session <id>... | --all) [--prefer further|keep|replace] [--context all|sessions] [--strict] [--dry-run]",
    ])
  })

  it("carries everything Magic Context holds: history runs, the whole project, user memories; leaves a managed project alone; refuses unknown data", async () => {
    const { home } = makeProfiles()
    mkdirSync(join(home, "managed"), { recursive: true })
    const plain = dirIdentity(join(home, "plain"))
    const managed = dirIdentity(join(home, "managed"))
    const win = new Database(opencodeOf("win"))
    win.exec("insert into session_v2 (id, project_id, slug, directory, title, version, time_created, time_updated) values ('ses_managed', 'global', 's', 'C:/Users/Me/managed', 't', '2', 1, 2)")
    win.exec("insert into session_message values ('ses_managed-m0', 'ses_managed', 'user', 0, 1, 1, '{}')")
    win.close()
    const source = new Database(contextOf("win"))
    source.exec(`insert into compartments (session_id, sequence, start_message, end_message, start_message_id, end_message_id, title, content, created_at, harness)
                   values ('ses_plain', 0, 0, 0, 'ses_plain-m0', 'ses_plain-m0', 't', 'plain summary', 1, 'opencode2'),
                          ('ses_managed', 0, 0, 0, 'ses_managed-m0', 'ses_managed-m0', 't', 'managed summary', 1, 'opencode2');
                 insert into session_projects values ('ses_plain', 'opencode2', 'dir:winplain', 1), ('ses_managed', 'opencode2', 'dir:winmanaged', 1);
                 insert into subagent_invocations (id, session_id, harness, subagent, started_at, status, parent_invocation_id) values (5, 'ses_plain', 'opencode2', 'historian', 1, 'done', null), (6, 'ses_plain', 'opencode2', 'historian', 2, 'done', 5);
                 insert into historian_runs (session_id, harness, subagent_invocation_id, run_kind, status, compartment_id_min, compartment_id_max, created_at)
                   values ('ses_plain', 'opencode2', 6, 'incremental', 'success', (select id from compartments where session_id = 'ses_plain'), (select id from compartments where session_id = 'ses_plain'), 1);
                 insert into primer_candidates (project_path, harness, session_id, question, normalized_question, source_message_time, created_at) values ('dir:winplain', 'opencode2', 'ses_plain', 'Q?', 'q', 1, 1);
                 insert into user_memory_candidates (content, session_id, created_at) values ('likes C:\\Users\\Me', 'ses_plain', 1);
                 insert into memories (project_path, category, content, normalized_hash, source_session_id, first_seen_at, created_at, updated_at, last_seen_at, status)
                   values ('dir:winplain', 'fact', 'from elsewhere', '${createHash("md5").update("from elsewhere").digest("hex")}', 'ses_other', 1, 1, 1, 1, 'active'),
                          ('dir:winmanaged', 'fact', 'guarded', '${createHash("md5").update("guarded").digest("hex")}', 'ses_managed', 1, 1, 1, 1, 'active');
                 insert into memory_verifications (memory_id, file_path, verified_at, mapped_at) values ((select id from memories where content = 'from elsewhere'), 'C:\\Users\\Me\\plain\\x.ts', 1, 1);
                 insert into notes (type, content, session_id, project_path, created_at, updated_at, harness) values ('smart', 'watch it', null, 'dir:winplain', 1, 1, 'opencode2'), ('smart', 'known', null, 'dir:winplain', 1, 1, 'opencode2');
                 insert into primers (project_path, question, answer, status, created_at, updated_at) values ('dir:winplain', 'How?', 'so', 'active', 1, 1), ('dir:winplain', 'Known?', 'yes', 'active', 1, 1);
                 insert into dream_runs (project_path, started_at, finished_at, holder_id, tasks_json) values ('dir:winplain', 1, 2, 'h', '[]'), ('dir:winplain', 3, 4, 'h', '[]');
                 insert into retrospective_processed_windows values ('dir:winplain', 'w1', 1), ('dir:winplain', 'w2', 1);
                 insert into user_memories (content, status, promoted_at, created_at, updated_at) values ('prefers bun', 'active', 1, 1, 1), ('known fact', 'active', 1, 1, 1)`)
    source.close()
    const target = new Database(contextOf("linux"))
    target.exec(`insert into notes (type, content, session_id, project_path, created_at, updated_at, harness) values ('smart', 'known', null, '${plain}', 1, 1, 'opencode2');
                 insert into primers (project_path, question, answer, status, created_at, updated_at) values ('${plain}', 'Known?', 'yes', 'active', 1, 1);
                 insert into dream_runs (project_path, started_at, finished_at, holder_id, tasks_json) values ('${plain}', 3, 4, 'h', '[]');
                 insert into retrospective_processed_windows values ('${plain}', 'w2', 1);
                 insert into user_memories (content, status, promoted_at, created_at, updated_at) values ('known fact', 'active', 1, 1, 1);
                 insert into authority_managed (project_path, context_store_uuid, marked_at) values ('${managed}', 'u', 1)`)
    target.close()

    const run = await cli(["sync", "--from", at("win"), "--to", at("linux"), "--session", "ses_plain", "--session", "ses_managed"])
    expect(run.code).toBe(0)
    expect(run.json.sessions.map((session: { id: string; context: { status: string; reason: string | null; counts: { history_rows: number } | null } }) => [session.id, session.context.status, session.context.reason, session.context.counts?.history_rows ?? null])).toEqual([
      ["ses_plain", "copied", null, 5],
      ["ses_managed", "skipped", "authority-managed", null],
    ])
    expect(run.json.projects).toEqual([
      { from: "dir:winplain", to: plain, memories_copied: 1, memories_already_there: 0, verifications: 1, notes: 1, primers: 1, dream_runs: 1, retrospective_windows: 1, skipped: null },
      { from: "dir:winmanaged", to: managed, memories_copied: 0, memories_already_there: 0, verifications: 0, notes: 0, primers: 0, dream_runs: 0, retrospective_windows: 0, skipped: "authority-managed" },
    ])
    expect(run.json.user_memories_copied).toBe(1)
    const context = contextOf("linux")
    expect(rowsOf(context, "select file_path from memory_verifications")).toEqual([{ file_path: `${home}/plain/x.ts` }])
    expect(rowsOf(context, "select content from user_memory_candidates")).toEqual([{ content: `likes ${home}` }])
    expect(rowsOf(context, "select count(*) as n from memories where project_path = ?", managed)).toEqual([{ n: 0 }])

    const again = await cli(["sync", "--from", at("win"), "--to", at("linux"), "--session", "ses_plain", "--dry-run"])
    expect(again.json.projects[0]).toMatchObject({ memories_copied: 0, memories_already_there: 1, notes: 0, primers: 0, dream_runs: 0, retrospective_windows: 0 })
    expect(again.json.user_memories_copied).toBe(0)

    const unknownContext = new Database(contextOf("linux"))
    unknownContext.exec("alter table tags add column invented text")
    unknownContext.close()
    const refusedContext = await cli(["sync", "--from", at("win"), "--to", at("linux"), "--session", "ses_plain", "--dry-run"])
    expect(refusedContext.errors[0]).toContain("tags.invented")
    const unknownOpenCode = new Database(opencodeOf("linux"))
    unknownOpenCode.exec("create table session_extra (session_id text, value text)")
    unknownOpenCode.close()
    const refusedOpenCode = await cli(["sync", "--from", at("win"), "--to", at("linux"), "--session", "ses_new", "--dry-run"])
    expect(refusedOpenCode.errors[0]).toContain("session_extra")
  })

  it("undoes the OpenCode swap when the Magic Context swap fails, leaving both stores as they were", async () => {
    makeProfiles()
    const before = { opencode: fileSha(opencodeOf("linux")), context: fileSha(contextOf("linux")) }
    // A full folder where the Magic Context original would go: its rename fails after the OpenCode one succeeded.
    mkdirSync(join(backupOf(), "context.db", "occupied"), { recursive: true })
    const failed = await cli(["sync", "--from", at("win"), "--to", at("linux"), "--all"])
    expect(failed.code).toBe(1)
    expect([fileSha(opencodeOf("linux")), fileSha(contextOf("linux"))]).toEqual([before.opencode, before.context])
    expect(readdirSync(backupOf())).toEqual(["context.db"])
    expect(readdirSync(at("linux", "opencode")).filter((name) => name.includes("incoming"))).toEqual([])
    expect(readdirSync(at("linux", "cortexkit", "magic-context")).filter((name) => name.includes("incoming"))).toEqual([])
  })

  it("--strict refuses the whole sync while Magic Context works on a requested session, writing nothing", async () => {
    makeProfiles()
    const before = { opencode: fileSha(opencodeOf("linux")), context: fileSha(contextOf("linux")) }
    const strict = await cli(["sync", "--from", at("win"), "--to", at("linux"), "--all", "--strict"])
    expect([strict.code, strict.errors]).toEqual([
      1,
      ["ERROR: --strict: Magic Context is working on ses_busy (a wrapup, or a summary run holding its lease); nothing was written. Wait for it to finish, or sync without --strict to skip it"],
    ])
    expect([fileSha(opencodeOf("linux")), fileSha(contextOf("linux"))]).toEqual([before.opencode, before.context])
    const named = await cli(["sync", "--from", at("win"), "--to", at("linux"), "--session", "ses_new", "--strict", "--dry-run"])
    expect([named.code, named.json?.dry_run]).toEqual([0, true])
  })

  it("writes under both stores' locks: refuses while another writer holds one, and clears a lock its owner left behind", async () => {
    makeProfiles()
    const before = { opencode: fileSha(opencodeOf("linux")), context: fileSha(contextOf("linux")) }
    const lock = `${contextOf("linux")}.session-manager.lock`
    writeFileSync(lock, JSON.stringify({ pid: process.ppid, command: "context sync", since: "2026-10-11T00:00:00.000Z" }))
    const locked = await cli(["sync", "--from", at("win"), "--to", at("linux"), "--all"])
    expect([locked.code, locked.errors[0]]).toEqual([
      1,
      `ERROR: ${contextOf("linux")} is being written by another opencode-session-manager (pid ${process.ppid}, context sync, since 2026-10-11T00:00:00.000Z); wait for it to finish, or remove ${lock} if no such process runs`,
    ])
    expect([fileSha(opencodeOf("linux")), fileSha(contextOf("linux")), existsSync(`${opencodeOf("linux")}.session-manager.lock`)]).toEqual([before.opencode, before.context, false])
    expect((await cli(["sync", "--from", at("win"), "--to", at("linux"), "--all", "--dry-run"])).code).toBe(0)

    writeFileSync(lock, JSON.stringify({ pid: 4_194_305, command: "sync", since: "2026-10-11T00:00:00.000Z" }))
    const run = await cli(["sync", "--from", at("win"), "--to", at("linux"), "--all"])
    expect([run.code, run.json.stale_locks_cleared]).toEqual([0, [{ file: lock, pid: 4_194_305, command: "sync", since: "2026-10-11T00:00:00.000Z" }]])
    expect([existsSync(lock), existsSync(`${opencodeOf("linux")}.session-manager.lock`)]).toEqual([false, false])
  })
})

describe("the browser applies its queue of whole sessions (real stores, OpenTUI's test renderer)", () => {
  it("queues sessions with their sub-agent sessions, checks them on copies, refuses a held store, applies, and shows the new state", async () => {
    const { home, repoId } = makeProfiles()
    const before = [fileSha(opencodeOf("linux")), fileSha(contextOf("linux"))]
    let setup: TestRendererSetup | undefined
    const container = await buildContainer(
      { OPENCODE_DB_COMPACT_IMAGE: NO_IMAGE, OPENCODE_SESSION_MANAGER_OFFLINE: "1" },
      {
        runtime: runtime(),
        show: showBrowser(async () => {
          setup = await createTestRenderer({ width: 200, height: 40 })
          return setup.renderer
        }),
      },
    )
    const running = container.run(["tui", "--left", at("linux"), "--right", at("win")])
    while (setup === undefined) await new Promise((resolve) => setTimeout(resolve, 10))
    const input = setup.mockInput
    await waitForText(setup, "ses_scp")
    input.pressKey("p")
    await waitForText(setup, "paired by session id")
    // Health from verify: ses_rep's stored project is not the one OpenCode derives for its folder here.
    input.pressKey("/")
    await input.typeText("ses_rep")
    input.pressEnter()
    input.pressKey("j")
    const health = await waitForText(setup, "~ project-mismatch")
    expect(health).toContain(" ~= ses_rep")
    expect(health).toContain("left  Health: no Magic Context state for its 1 messages · ~ project-mismatch")
    // Side by side, the details give the finding in its own words.
    input.pressKey("p")
    expect(await waitForText(setup, "  project-mismatch: stored project p_moved, OpenCode derives")).toContain("ses_rep · v2 · project p_moved")
    input.pressKey("p")
    await waitForText(setup, "paired by session id")
    input.pressEscape()
    await waitForText(setup, "ses_scp")
    input.pressKey("*")
    input.pressKey("<")
    // 14 sessions shown; the sub-agent session queues its root once.
    await waitForText(setup, "Queued 13 session syncs ←.")
    input.pressKey("Q")
    // "a" while the dry run is still painting its notice is ignored: nothing is applied.
    input.pressKey("d")
    input.pressKey("a")
    const checked = await waitForText(setup, "← Dry run: 8 copied, 1 replaced, 3 kept, 1 skipped", 60000)
    expect(checked).toContain("Queue · 13 session syncs · 8 new on the target · 1 diverged")
    for (const text of ["further diverged: skipped", "further same: context only", "further replace (target behind)"]) expect(checked).toContain(text)
    expect([fileSha(opencodeOf("linux")), fileSha(contextOf("linux"))]).toEqual(before)
    // ses_same: keep this side's Magic Context state instead of the one that reaches further.
    for (let row = 0; row < 5; row++) input.pressArrow("down")
    input.pressKey("r")
    input.pressKey("d")
    expect(await waitForText(setup, "keep    same: nothing", 60000)).toContain("← Dry run:")
    const holder = new Database(opencodeOf("linux"))
    input.pressKey("a")
    expect(await waitForText(setup, "Not applied:", 60000)).toContain("Not applied:")
    holder.close()
    expect([fileSha(opencodeOf("linux")), fileSha(contextOf("linux"))]).toEqual(before)
    input.pressKey("a")
    const applied = await waitForText(setup, "← Applied: 8 copied, 1 replaced, 3 kept, 1 skipped", 60000)
    expect(applied).toContain("Originals kept; undo: opencode-session-manager rollback")
    input.pressKey("Q")
    // The left side was read again: the copied sessions are on both sides now.
    expect(await waitForText(setup, "= ses_scp")).toContain("= ses_new_child")
    // And back: this machine's own Magic Context state of ses_same replaces the other side's.
    input.pressKey("/")
    await input.typeText("ses_same")
    input.pressEnter()
    await waitForText(setup, 'filter "ses_same"')
    input.pressKey("g")
    input.pressArrow("down")
    input.pressKey(">")
    await waitForText(setup, "Queued 1 session sync →.")
    input.pressKey("Q")
    input.pressKey("r")
    input.pressKey("r")
    input.pressKey("a")
    expect(await waitForText(setup, "→ Applied: 0 copied, 0 replaced, 1 kept, 0 skipped", 60000)).toContain("Magic Context: state copied for 1 of 1 sessions")
    input.pressKey("Q")
    expect(await waitForText(setup, "S 1 T    5 │ 01-01 00:00     2m S 1 T    5")).toContain("ses_same")
    input.pressKey("q")
    const out = captureConsole()
    try {
      expect(await running).toBe(0)
    } finally {
      out.restore()
    }
    // After the browser closes, what was applied is printed whole: the undo command does not fit the panel.
    // The way back only changed Magic Context state, so only that store was swapped.
    expect(out.lines.filter((line) => line.startsWith("Originals kept"))).toEqual([
      `Originals kept; undo: opencode-session-manager rollback ${backupOf()} --db ${opencodeOf("linux")} --db ${contextOf("linux")}`,
      `Originals kept; undo: opencode-session-manager rollback ${at("win", "opencode", `sync-backup-${STAMP}`)} --db ${contextOf("win")}`,
    ])
    expect(query(opencodeOf("linux"), "select project_id, directory from session_v2 where id = 'ses_new'")).toEqual([{ project_id: repoId, directory: join(home, "repo") }])
    expect(rowsOf(contextOf("linux"), "select count(*) as n from compartments where session_id = 'ses_same'")).toEqual([{ n: 1 }])
    expect(readdirSync(at("linux", "opencode")).filter((name) => name.startsWith("sync-backup-"))).toEqual([`sync-backup-${STAMP}`])
  })
})
