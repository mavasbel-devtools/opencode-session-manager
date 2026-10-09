import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { Database } from "bun:sqlite"
import { createHash } from "node:crypto"
import { mkdirSync, readdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { createTestRenderer, type TestRendererSetup } from "@opentui/core/testing"
import type { RuntimePort } from "@session-manager/domain/ports/outbound/RuntimePort"
import { showBrowser } from "@session-manager/infrastructure/adapters/inbound/manager-tui/OpenTuiBrowser"
import { buildContainer } from "@session-manager/main/cli-container"
import { fileSha } from "@test/support/maintenance/database"
import { captureConsole, captureConsoleError } from "@test/support/maintenance/console"
import { removeTemporary, temporaryWorkspace } from "@test/support/maintenance/temporary"
import { waitForText } from "@test/support/sessions/frames"
import { makeMagicContextPackage } from "@test/support/sessions/magic-context-package"
import { makeOpenCodeStore } from "@test/support/sessions/stores"
import { makeSyncContextStore, rowsOf, type StateSpec } from "@test/support/sessions/sync-stores"

const STAMP = "2026-10-08-12-00-00"
const NO_IMAGE = "no-such-opencode-image"

let directory = ""
beforeEach(() => {
  directory = temporaryWorkspace("oc-context-sync-e2e-")
})
afterEach(() => {
  removeTemporary(directory)
})

const at = (...parts: string[]) => join(directory, ...parts)
const contextOf = (side: string) => at(side, "cortexkit", "magic-context", "context.db")
const opencodeOf = (side: string) => at(side, "opencode", "opencode.db")
const dirIdentity = (path: string) => `dir:${createHash("md5").update(path).digest("hex").slice(0, 12)}`

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

async function cli(argv: string[], environment: Record<string, string> = {}) {
  const out = captureConsole()
  const errors = captureConsoleError()
  try {
    const container = await buildContainer({ OPENCODE_DB_COMPACT_IMAGE: NO_IMAGE, ...environment }, { runtime: runtime() })
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

const anchors = (id: string, last: number) => [{ start: `${id}-m0`, end: `${id}-m${last}`, content: `worked in C:\\Users\\Me\\work\\app\\src for ${id}` }]

/**
 * A Windows profile (source) and this machine's (target). Every session id is on both sides unless
 * noted; folders exist under the test folder, which stands for this machine.
 */
function makeProfiles(options: { sourceFormat?: number; targetExtraSql?: string } = {}) {
  const app = at("home", "apps", "app")
  const repo = at("home", "repo")
  mkdirSync(app, { recursive: true })
  mkdirSync(repo, { recursive: true })
  const git = (...args: string[]) =>
    Bun.spawnSync(["git", ...args], {
      cwd: repo,
      env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" },
    })
      .stdout.toString()
      .trim()
  git("init", "-q")
  git("commit", "-q", "--allow-empty", "-m", "root")
  const root = git("rev-list", "--max-parents=0", "HEAD")

  const shared = (id: string, directory: string, entries = 3) => ({ id, title: id, directory, updated: 10, entries })
  makeOpenCodeStore(opencodeOf("win"), {
    v2: [
      shared("ses_win", "C:/Users/Me/work/app"),
      shared("ses_repo", "C:/Users/Me/repo"),
      shared("ses_keep", "C:/Users/Me/work/app"),
      shared("ses_nostate", "C:/Users/Me/work/app"),
      shared("ses_ahead", "C:/Users/Me/work/app", 5),
      shared("ses_div", "C:/Users/Me/work/app"),
      shared("ses_stale", "C:/Users/Me/work/app"),
      shared("ses_noproject", "C:/Users/Me/gone"),
      shared("ses_winonly", "C:/Users/Me/work/app"),
    ],
  })
  makeOpenCodeStore(opencodeOf("linux"), {
    v2: [
      shared("ses_win", app, 4),
      shared("ses_repo", repo),
      shared("ses_keep", app),
      shared("ses_nostate", app),
      shared("ses_ahead", app),
      shared("ses_div", app),
      shared("ses_stale", app),
      shared("ses_noproject", at("home", "gone")),
      shared("ses_linuxonly", app),
    ],
  })
  const divergent = new Database(opencodeOf("linux"))
  divergent.exec("update session_message set id = 'ses_div-other' where id = 'ses_div-m1'")
  divergent.close()

  const sourceState: Record<string, StateSpec> = {
    ses_win: { compartments: anchors("ses_win", 2), tags: 3, notes: ["see C:\\Users\\Me\\work\\app"], memories: [{ content: "app lives in C:\\Users\\Me\\work\\app" }, { content: "plain", embedded: true }], project: "dir:winapp", extras: true, meta: true },
    ses_repo: { compartments: anchors("ses_repo", 1), tags: 1, project: "dir:winrepo" },
    ses_keep: { compartments: anchors("ses_keep", 1), tags: 2 },
    ses_nostate: { project: "dir:winapp" },
    ses_ahead: { compartments: anchors("ses_ahead", 4), tags: 1 },
    ses_div: { compartments: anchors("ses_div", 1), tags: 1 },
    ses_stale: { harness: "opencode", compartments: [{ start: "v1-message", end: "v1-message" }], tags: 1 },
    ses_noproject: { compartments: anchors("ses_noproject", 1), tags: 1, project: "dir:gone" },
    ses_winonly: { compartments: anchors("ses_winonly", 1), tags: 1 },
  }
  makeSyncContextStore(contextOf("win"), { format: options.sourceFormat ?? 94, sessions: sourceState })
  makeSyncContextStore(contextOf("linux"), {
    sessions: { ses_keep: { compartments: [{ start: "ses_keep-m0", end: "ses_keep-m0", content: "linux's own" }], tags: 7, project: dirIdentity(app) } },
    ...(options.targetExtraSql === undefined ? {} : { extraSql: options.targetExtraSql }),
  })
  return { app, repo, root }
}

const ALL_IDS = ["ses_win", "ses_repo", "ses_keep", "ses_nostate", "ses_ahead", "ses_div", "ses_stale", "ses_noproject", "ses_winonly", "ses_missing"]
const sessionsArgs = (ids: string[]) => ids.flatMap((id) => ["--session", id])

describe("context sync (real stores, the wired container)", () => {
  it("rehearses on copies, then copies what is safe, explains the rest, and is undone by rollback", async () => {
    const { app, root } = makeProfiles()
    const before = fileSha(contextOf("linux"))
    const sourceBefore = fileSha(contextOf("win"))
    const dry = await cli(["context", "sync", "--from", at("win"), "--to", at("linux"), ...sessionsArgs(ALL_IDS), "--dry-run"])
    expect(dry.code).toBe(0)
    expect(fileSha(contextOf("linux"))).toBe(before)
    expect(dry.json.sessions.map((session: { id: string; status: string; reason: string | null }) => [session.id, session.status, session.reason])).toEqual([
      ["ses_win", "copied", null],
      ["ses_repo", "copied", null],
      ["ses_keep", "skipped", "resolution-skip"],
      ["ses_nostate", "skipped", "no-state"],
      ["ses_ahead", "skipped", "source-ahead"],
      ["ses_div", "skipped", "diverged"],
      ["ses_stale", "skipped", "stale-anchors"],
      ["ses_noproject", "skipped", "no-project"],
      ["ses_winonly", "skipped", "not-on-target"],
      ["ses_missing", "skipped", "not-on-source"],
    ])
    expect(dry.json).toMatchObject({ dry_run: true, backup_dir: null, checks: { integrity_ok: true, foreign_keys_ok: true, anchors_ok: true, counts_ok: true } })

    const run = await cli(["context", "sync", "--from", at("win"), "--to", at("linux"), ...sessionsArgs(ALL_IDS)])
    expect(run.code).toBe(0)
    const backup = join(at("linux", "cortexkit", "magic-context"), `context-sync-backup-${STAMP}`)
    expect(run.json.backup_dir).toBe(backup)
    expect(fileSha(contextOf("win"))).toBe(sourceBefore)
    const target = contextOf("linux")
    expect(rowsOf(target, "select content from compartments where session_id = 'ses_win'")).toEqual([{ content: `worked in ${at("home")}/apps/app/src for ses_win` }])
    expect(rowsOf(target, "select project_path from session_projects where session_id = 'ses_win'")).toEqual([{ project_path: dirIdentity(app) }])
    expect(rowsOf(target, "select project_path from session_projects where session_id = 'ses_repo'")).toEqual([{ project_path: `git:${root}` }])
    expect(rowsOf(target, "select content from memories where source_session_id = 'ses_win' order by id")).toEqual([
      { content: `app lives in ${at("home")}/apps/app` },
      { content: "plain" },
    ])
    expect(rowsOf(target, "select content from compartments where session_id = 'ses_keep'")).toEqual([{ content: "linux's own" }])
    expect(run.json.sessions[0]).toMatchObject({ counts: { compartments: 1, tags: 3, notes: 1, memories_copied: 0 }, residual_windows_paths: 0 })
    expect(run.json.projects).toContainEqual(expect.objectContaining({ from: "dir:winapp", to: dirIdentity(app), memories_copied: 2, skipped: null }))

    const rollback = await cli(["rollback", backup, "--db", target])
    expect(rollback.code).toBe(0)
    expect(fileSha(target)).toBe(before)
  })

  it("copies --all the source has state for, replacing the target's with --replace", async () => {
    makeProfiles()
    const run = await cli(["context", "sync", "--from", at("win"), "--to", at("linux"), "--all", "--replace", "--context", "sessions"])
    expect(run.code).toBe(0)
    expect(run.json).toMatchObject({ scope: "sessions", projects: [], user_memories_copied: 0 })
    expect(run.json.sessions.find((session: { id: string }) => session.id === "ses_win").counts.memories_copied).toBe(2)
    expect(run.json.sessions.filter((session: { status: string }) => session.status === "copied").map((session: { id: string }) => session.id).sort()).toEqual([
      "ses_keep",
      "ses_repo",
      "ses_win",
    ])
    expect(rowsOf(contextOf("linux"), "select content from compartments where session_id = 'ses_keep'")).toEqual([{ content: `worked in ${at("home")}/apps/app/src for ses_keep` }])
    const nothing = await cli(["context", "sync", "--from", at("win"), "--to", at("linux"), "--session", "ses_missing"])
    expect(nothing.json).toMatchObject({ backup_dir: null, sessions: [{ reason: "not-on-source" }] })
  })

  it("brings an older source to the target's format with the installed Magic Context", async () => {
    makeProfiles({ sourceFormat: 91 })
    const release = makeMagicContextPackage(at("mc"), { version: "0.45.0", latest: 94 })
    const run = await cli(["context", "sync", "--from", at("win"), "--to", at("linux"), "--session", "ses_win", "--dry-run"], {
      OPENCODE_SESSION_MANAGER_MAGIC_CONTEXT: release,
    })
    expect(run.code).toBe(0)
    expect(run.json).toMatchObject({ format: 94, sessions: [{ id: "ses_win", status: "copied" }] })
    const wrong = makeMagicContextPackage(at("mc93"), { version: "0.44.0", latest: 93 })
    const missed = await cli(["context", "sync", "--from", at("win"), "--to", at("linux"), "--all"], { OPENCODE_SESSION_MANAGER_MAGIC_CONTEXT: wrong })
    expect(missed.errors[0]).toEndWith("the installed Magic Context cannot bring the source to the target's format; update Magic Context here")
  })

  it("refuses a newer source, a missing store, a held target, a failed check, a failed write and a failed swap", async () => {
    makeProfiles({ sourceFormat: 95 })
    const newer = await cli(["context", "sync", "--from", at("win"), "--to", at("linux"), "--all"])
    expect(newer.errors[0]).toContain("update Magic Context where the target is used")
    const missing = await cli(["context", "sync", "--from", at("nowhere"), "--to", at("linux"), "--all"])
    expect(missing.code).toBe(1)
    const usage = await cli(["context", "sync", "--from", at("win")])
    expect([usage.code, usage.text]).toEqual([2, "usage: opencode-session-manager context copy --from <context.db> --to <file>\n       opencode-session-manager context sync --from <dataHome> --to <dataHome> (--session <id>... | --all) [--prefer keep|further|replace | --replace] [--context all|sessions] [--dry-run]"])
    removeTemporary(directory)
    directory = temporaryWorkspace("oc-context-sync-e2e-")

    makeProfiles()
    const holder = new Database(contextOf("linux"))
    try {
      const held = await cli(["context", "sync", "--from", at("win"), "--to", at("linux"), "--all"])
      expect(held.errors[0]).toContain("is held open by")
    } finally {
      holder.close()
    }
    writeFileSync(join(at("linux", "cortexkit", "magic-context"), `context-sync-backup-${STAMP}`), "in the way")
    const before = fileSha(contextOf("linux"))
    const swap = await cli(["context", "sync", "--from", at("win"), "--to", at("linux"), "--all"])
    expect(swap.code).toBe(1)
    expect(fileSha(contextOf("linux"))).toBe(before)
    expect(readdirSync(at("linux", "cortexkit", "magic-context")).filter((name) => name.includes("incoming"))).toEqual([])
    removeTemporary(directory)
    directory = temporaryWorkspace("oc-context-sync-e2e-")

    makeProfiles({ targetExtraSql: "create trigger skew after insert on compartments begin update compartments set start_message_id = 'elsewhere' where id = new.id; end" })
    const skewed = await cli(["context", "sync", "--from", at("win"), "--to", at("linux"), "--all"])
    expect(skewed.errors[0]).toBe("ERROR: the synced copy failed anchors_ok; the target store was left untouched")
    removeTemporary(directory)
    directory = temporaryWorkspace("oc-context-sync-e2e-")

    makeProfiles({ targetExtraSql: "create trigger refuse after insert on tags begin select raise(abort, 'refused by trigger'); end" })
    const refused = await cli(["context", "sync", "--from", at("win"), "--to", at("linux"), "--all"])
    expect(refused.errors[0]).toBe("ERROR: refused by trigger")
  })
})

describe("the browser applies its queue (real stores, OpenTUI's test renderer)", () => {
  it("checks, refuses undecided conflicts, applies, shows the result and the new state, and reports a failure", async () => {
    makeProfiles()
    let setup: TestRendererSetup | undefined
    const container = await buildContainer(
      { OPENCODE_DB_COMPACT_IMAGE: NO_IMAGE },
      {
        runtime: runtime(),
        show: showBrowser(async () => {
          setup = await createTestRenderer({ width: 160, height: 30 })
          return setup.renderer
        }),
      },
    )
    const running = container.run(["tui", "--left", at("linux"), "--right", at("win")])
    while (setup === undefined) await new Promise((resolve) => setTimeout(resolve, 10))
    const input = setup.mockInput
    await waitForText(setup, "ses_win")
    input.pressKey("p")
    await waitForText(setup, "paired by session id")
    input.pressKey("/")
    await input.typeText("ses_")
    input.pressEnter()
    input.pressKey("*")
    input.pressKey("<")
    await waitForText(setup, "Queued 7 Magic Context copies ←; skipped 1 not on the right, 1 not on the left")
    input.pressKey("Q")
    input.pressKey("a")
    await waitForText(setup, "Decide every conflict first")
    input.pressKey("S")
    input.pressKey("d")
    await waitForText(setup, "Dry run: 2 of 7 sessions copied")
    const holder = new Database(contextOf("linux"))
    input.pressKey("a")
    await waitForText(setup, "Not applied:")
    holder.close()
    input.pressKey("a")
    const done = await waitForText(setup, "Applied: 2 of 7 sessions copied")
    expect(done).toContain("Original kept in")
    input.pressEscape()
    const after = await waitForText(setup, "S 1 T    3")
    expect(after).toContain("ses_win")
    // And back: this machine's state of one session replaces the other side's.
    input.pressKey("/")
    for (let index = 0; index < "ses_".length; index++) input.pressBackspace()
    await input.typeText("ses_keep")
    input.pressEnter()
    await waitForText(setup, 'filter "ses_keep"')
    input.pressKey("j")
    input.pressKey(">")
    input.pressKey("Q")
    input.pressKey("R")
    input.pressKey("a")
    await waitForText(setup, "Applied: 1 of 1 sessions copied")
    input.pressEscape()
    await waitForText(setup, "S 1 T    7 │ 01-01 00:00     3m S 1 T    7")
    input.pressKey("q")
    expect(await running).toBe(0)
    expect(rowsOf(contextOf("linux"), "select count(*) as n from compartments where session_id = 'ses_win'")).toEqual([{ n: 1 }])
  })
})
