import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { Database } from "bun:sqlite"
import { createHash } from "node:crypto"
import { mkdirSync, realpathSync } from "node:fs"
import { join } from "node:path"
import type { RuntimePort } from "@session-manager/domain/ports/outbound/RuntimePort"
import { buildContainer } from "@session-manager/main/cli-container"
import { captureConsole, captureConsoleError } from "@test/support/maintenance/console"
import { fileSha } from "@test/support/maintenance/database"
import { makeRepository, sha1 } from "@test/support/maintenance/repositories"
import { removeTemporary, temporaryWorkspace } from "@test/support/maintenance/temporary"
import { currentPlatform } from "@test/support/platform"
import { makeOpenCode2Store } from "@test/support/sessions/opencode-stores"
import { makeSyncContextStore } from "@test/support/sessions/sync-stores"

const NOW = Date.parse("2026-10-11T12:00:00Z")
let directory = ""
beforeEach(() => {
  directory = realpathSync(temporaryWorkspace("oc-verify-e2e-"))
})
afterEach(() => {
  removeTemporary(directory)
})

const at = (...parts: string[]) => join(directory, ...parts)
const opencodeOf = () => at("data", "opencode", "opencode.db")
const contextOf = () => at("data", "cortexkit", "magic-context", "context.db")

function runtime(): RuntimePort {
  mkdirSync(at("tmp"), { recursive: true })
  return { pid: () => process.pid, platform: () => currentPlatform(), now: () => NOW, stamp: () => "s", temporaryDirectory: () => at("tmp"), homeDirectory: () => at("home") }
}

async function cli(argv: string[]) {
  const out = captureConsole()
  const errors = captureConsoleError()
  try {
    const container = await buildContainer({ OPENCODE_DB_COMPACT_IMAGE: "no-such-image" }, { runtime: runtime() })
    const code = await container.run(argv)
    const text = out.lines.join("\n")
    return { code, text, json: text.startsWith("{") ? JSON.parse(text) : null, errors: errors.lines }
  } finally {
    out.restore()
    errors.restore()
  }
}

const dirIdentity = (path: string) => `dir:${createHash("md5").update(path).digest("hex").slice(0, 12)}`
const ids = (id: string, count: number) => Array.from({ length: count }, (_, index) => `${id}-m${index}`)
const summary = (id: string, index: number) => ({ start: `${id}-m${index}`, end: `${id}-m${index}` })

/** A profile whose sessions each show one thing `verify` looks for, beside one that is fine. */
function makeProfile(options: { fkViolation?: boolean } = {}) {
  const plain = at("home", "plain")
  const repo = at("home", "repo")
  mkdirSync(plain, { recursive: true })
  makeRepository(repo, { remote: "https://github.com/Ex/Repo.git", commit: true })
  const plainId = sha1(`directory:${plain}`)
  makeOpenCode2Store(opencodeOf(), {
    projects: [
      { id: plainId, worktree: plain },
      { id: "p_old", worktree: repo },
    ],
    sessions: [
      { id: "ses_fine", directory: plain, projectId: plainId, entries: ids("ses_fine", 3) },
      { id: "ses_moved", directory: repo, projectId: "p_old", entries: ids("ses_moved", 2) },
      { id: "ses_behind", directory: plain, projectId: plainId, entries: ids("ses_behind", 8) },
      { id: "ses_over", directory: plain, projectId: plainId, entries: ids("ses_over", 2) },
      { id: "ses_stale", directory: plain, projectId: plainId, entries: ids("ses_stale", 2) },
      { id: "ses_wrapup", directory: plain, projectId: plainId, entries: ids("ses_wrapup", 2) },
      { id: "ses_left", directory: plain, projectId: plainId, entries: ids("ses_left", 2) },
      { id: "ses_lost", directory: at("home", "gone"), projectId: plainId, entries: ids("ses_lost", 2) },
    ],
  })
  makeSyncContextStore(contextOf(), {
    format: 95,
    sessions: {
      ses_fine: { compartments: [summary("ses_fine", 1)], tags: 1, project: dirIdentity(plain), meta: true },
      ses_moved: { compartments: [summary("ses_moved", 1)], tags: 1, project: "git:somewhere-else" },
      ses_behind: { compartments: [summary("ses_behind", 1)], tags: 1, project: dirIdentity(plain) },
      ses_over: { compartments: [summary("ses_over", 1)], tags: 1, project: dirIdentity(plain), meta: true },
      ses_stale: { harness: "opencode", compartments: [{ start: "msg_v1", end: "msg_v1" }], tags: 1, project: dirIdentity(plain) },
      ses_wrapup: { compartments: [summary("ses_wrapup", 1)], tags: 1, project: dirIdentity(plain), meta: true },
      ses_left: { compartments: [summary("ses_left", 1)], tags: 1, project: dirIdentity(plain), meta: true },
      ses_lost: { compartments: [summary("ses_lost", 1)], tags: 1, project: dirIdentity(plain) },
      ses_deleted: { compartments: [{ start: "x", end: "x" }], tags: 2 },
      ses_memories_only: { memories: [{ content: "kept by the project" }] },
    },
    extraSql: `update session_meta set last_context_percentage = 104.5, last_input_tokens = 1045000 where session_id = 'ses_over';
               update session_meta set last_context_percentage = 40 where session_id = 'ses_fine';
               update session_meta set wrapup_in_progress_state = '{"expiresAt":${NOW + 60_000}}' where session_id = 'ses_wrapup';
               update session_meta set wrapup_in_progress_state = '{"expiresAt":${NOW - 60_000}}' where session_id = 'ses_left';`,
  })
  if (options.fkViolation === true) {
    const db = new Database(opencodeOf())
    db.exec("pragma foreign_keys = off; insert into session_message values ('orphan-m0', 'ses_nowhere', 'user', 0, 1, 1, '{}')")
    db.close()
  }
  return { plain, repo, plainId }
}

describe("verify (real stores, the wired container)", () => {
  it("reports every kind of finding, reading only", async () => {
    const { repo } = makeProfile()
    const before = [fileSha(opencodeOf()), fileSha(contextOf())]
    const run = await cli(["verify", "--data", at("data"), "--behind", "3", "--json"])
    expect([fileSha(opencodeOf()), fileSha(contextOf())]).toEqual(before)
    expect(run.code).toBe(1)
    const report = run.json
    expect(report).toMatchObject({
      opencode_db: opencodeOf(),
      context_db: contextOf(),
      magic_context_format: 95,
      checks: { opencode: { integrity_ok: true, foreign_keys_ok: true }, context: { integrity_ok: true, foreign_keys_ok: true } },
      sessions_checked: 8,
      counts: { error: 1, warning: 6, info: 1 },
      ok: false,
    })
    const found = report.findings.map((entry: { severity: string; kind: string; session_id: string | null }) => `${entry.severity} ${entry.kind} ${entry.session_id}`)
    expect(found.sort()).toEqual(
      [
        "warning orphan-context-state ses_deleted",
        `warning project-mismatch ses_moved`,
        "warning context-project-mismatch ses_moved",
        "warning summaries-behind ses_behind",
        "error over-limit ses_over",
        "warning stale-summaries ses_stale",
        "info wrapup-running ses_wrapup",
        "warning wrapup-left-behind ses_left",
      ].sort(),
    )
    const derived = sha1("git-remote:github.com/Ex/Repo")
    expect(report.findings.find((entry: { kind: string }) => entry.kind === "project-mismatch").detail).toBe(`stored project p_old, OpenCode derives ${derived} for ${repo}`)
    const fine = report.sessions.find((session: { id: string }) => session.id === "ses_fine")
    expect(fine).toEqual({ id: "ses_fine", title: "ses_fine", directory: at("home", "plain"), messages: 3, summaries: 1, unsummarized: 1, last_context_percentage: 40, wrapup: "none" })
    expect(report.sessions.find((session: { id: string }) => session.id === "ses_behind").unsummarized).toBe(6)
    expect(report.sessions.find((session: { id: string }) => session.id === "ses_stale").unsummarized).toBeNull()
  })

  it("prints the findings for a person, checks only the --session named, and fails on a broken store", async () => {
    makeProfile({ fkViolation: true })
    const text = await cli(["verify", "--data", at("data"), "--session", "ses_fine", "--session", "ses_none"])
    expect([text.code, text.text.split("\n")]).toEqual([
      1,
      [
        `opencode.db: ${opencodeOf()} — integrity ok, foreign keys FAILED`,
        `context.db (format 95): ${contextOf()} — integrity ok, foreign keys ok`,
        "1 sessions checked",
        `ERROR store-foreign-keys: ${opencodeOf()} has rows whose foreign key points at nothing`,
        "WARN  session-not-found ses_none: the profile has no such session",
        "PROBLEMS: 1 errors, 1 warnings, 0 notes",
      ],
    ])
    expect((await cli(["verify", "--data", at("data"), "--behind", "-1"])).code).toBe(2)
  })

  it("checks a profile without Magic Context, and passes a sound one", async () => {
    const plain = at("home", "plain")
    mkdirSync(plain, { recursive: true })
    makeOpenCode2Store(opencodeOf(), { projects: [{ id: sha1(`directory:${plain}`), worktree: plain }], sessions: [{ id: "ses_a", directory: plain, projectId: sha1(`directory:${plain}`) }] })
    const run = await cli(["verify", "--data", at("data")])
    expect([run.code, run.text.split("\n")]).toEqual([
      0,
      [`opencode.db: ${opencodeOf()} — integrity ok, foreign keys ok`, "context.db: none", "1 sessions checked", "OK: 0 errors, 0 warnings, 0 notes"],
    ])
  })
})
