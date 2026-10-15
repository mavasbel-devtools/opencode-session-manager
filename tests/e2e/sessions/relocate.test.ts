import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { Database } from "bun:sqlite"
import { spawnSync } from "node:child_process"
import { mkdirSync, readdirSync, realpathSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import type { RuntimePort } from "@session-manager/domain/ports/outbound/RuntimePort"
import { buildContainer } from "@session-manager/main/cli-container"
import { captureConsole, captureConsoleError } from "@test/support/maintenance/console"
import { fileSha } from "@test/support/maintenance/database"
import { makeRepository, query, sha1 } from "@test/support/maintenance/repositories"
import { removeTemporary, temporaryWorkspace } from "@test/support/maintenance/temporary"
import { makeOpenCode2Store } from "@test/support/sessions/opencode-stores"
import { makeSyncContextStore, rowsOf } from "@test/support/sessions/sync-stores"
import { normalizedHash } from "@session-manager/infrastructure/adapters/outbound/sqlite/BunMagicContextSyncStoreAdapter"

const STAMP = "2026-10-12-12-00-00"

let directory = ""
beforeEach(() => {
  directory = realpathSync(temporaryWorkspace("oc-relocate-e2e-"))
})
afterEach(() => {
  removeTemporary(directory)
})

const at = (...parts: string[]) => join(directory, ...parts)
const opencodeDb = () => at("data", "opencode", "opencode.db")
const contextDb = () => at("data", "cortexkit", "magic-context", "context.db")

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
    const container = await buildContainer({ OPENCODE_DB_COMPACT_IMAGE: "no-such-image" }, { runtime: runtime() })
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

/**
 * A profile whose sessions live in `~/Documents/old-rel`, a folder that is gone: its repository is
 * now `~/repos/rel` (a git repository with an origin remote), with the same `sub` folder; `gone`
 * was not carried over.
 */
function makeProfile(contextSql = "") {
  const home = at("home")
  const old = join(home, "Documents", "old-rel")
  const moved = join(home, "repos", "rel")
  makeRepository(moved, { remote: "https://github.com/Ex/Rel.git", commit: true })
  mkdirSync(join(moved, "sub"), { recursive: true })
  const root = spawnSync("git", ["-C", moved, "rev-list", "--max-parents=0", "HEAD"], { encoding: "utf8" }).stdout.trim()
  makeOpenCode2Store(opencodeDb(), {
    projects: [{ id: "p_old", worktree: old, name: "Rel" }],
    sessions: [
      { id: "ses_a", directory: old, projectId: "p_old", v1: true, extras: true },
      { id: "ses_a_child", directory: join(old, "sub"), projectId: "p_old", parentId: "ses_a" },
      { id: "ses_gone", directory: join(old, "gone"), projectId: "p_old" },
      { id: "ses_other", directory: join(home, "elsewhere") },
    ],
    // Another session naming the folder absolutely and as `~/…`, and a folder that only shares its prefix.
    extraSql: `update session_message set data = '{"text":"read ${old}/README.md, then cd ~/Documents/old-rel/sub; not ${old}-2025"}' where id = 'ses_other-m0'`,
  })
  makeSyncContextStore(contextDb(), {
    format: 95,
    sessions: {
      ses_a: {
        project: "git:old",
        compartments: [{ start: "ses_a-m0", end: "ses_a-m1", content: `worked in ${old}/src` }],
        // The second, rewritten, would repeat the third: it is left as it is.
        memories: [{ content: `build with ${old}/make.sh` }, { content: `tests in ${old}/t` }, { content: `tests in ${moved}/t` }],
        meta: true,
      },
      ses_a_child: { project: "git:old" },
      ses_other: { project: "dir:other", compartments: [{ start: "ses_other-m0", end: "ses_other-m0", content: `compared with ${old}` }], meta: true },
    },
    // A cached prompt naming the folder, of a session that stays: cleared, Magic Context rebuilds it.
    extraSql: `update session_meta set cached_m0_bytes = 'prompt naming ${old}' where session_id = 'ses_other'; ${contextSql}`,
  })
  return { home, old, moved, root, project: sha1("git-remote:github.com/Ex/Rel") }
}

const mapOf = (old: string, moved: string) => ["--map", `${old}=${moved}`]

describe("relocate (real stores and folders, the wired container)", () => {
  it("rehearses, then moves sessions with their text and Magic Context state, and one rollback restores both stores", async () => {
    const { home, old, moved, root, project } = makeProfile()
    const before = [fileSha(opencodeDb()), fileSha(contextDb())]

    const dry = await cli(["relocate", "--data", at("data"), ...mapOf(old, moved), "--all", "--dry-run", "--json"])
    expect(dry.code).toBe(0)
    expect(dry.json.sessions.map((session: { id: string; to_directory: string; to_project: string; context_to_project: string | null }) => [session.id, session.to_directory, session.to_project, session.context_to_project])).toEqual([
      ["ses_a", moved, project, `git:${root}`],
      ["ses_a_child", join(moved, "sub"), project, `git:${root}`],
    ])
    expect(dry.json.skipped).toEqual([{ id: "ses_gone", directory: join(old, "gone"), reason: "folder-missing", to_directory: join(moved, "gone") }])
    expect(dry.json.failed).toEqual([])
    expect([fileSha(opencodeDb()), fileSha(contextDb())]).toEqual(before)

    const run = await cli(["relocate", "--data", at("data"), ...mapOf(old, moved), "--all"])
    expect(run.errors).toEqual([])
    expect(run.code).toBe(0)
    const backup = at("data", "opencode", `relocate-backup-${STAMP}`)
    expect(run.text.split("\n")).toEqual([
      `Relocated: 2 sessions (1 root sessions with their sub-agent sessions) → ${opencodeDb()}`,
      expect.stringMatching(/^Text: \d+ OpenCode rows rewritten, 4 Magic Context rows$/),
      `Magic Context projects merged: git:old → git:${root} (2 memories)`,
      "Skipped: ses_gone (folder-missing)",
      `Originals kept; undo: opencode-session-manager rollback ${backup} --db ${opencodeDb()} --db ${contextDb()}`,
    ])
    expect(query(opencodeDb(), "select id, directory, project_id, path from session_v2 order by id")).toEqual([
      { id: "ses_a", directory: moved, project_id: project, path: null },
      { id: "ses_a_child", directory: join(moved, "sub"), project_id: project, path: "sub" },
      { id: "ses_gone", directory: join(old, "gone"), project_id: "p_old", path: null },
      { id: "ses_other", directory: join(home, "elsewhere"), project_id: "global", path: null },
    ])
    expect(query(opencodeDb(), "select id, worktree from project where id = ?", project)).toEqual([{ id: project, worktree: moved }])
    expect(query(opencodeDb(), "select data from session_message where id = 'ses_other-m0'")).toEqual([
      { data: `{"text":"read ${moved}/README.md, then cd ~/repos/rel/sub; not ${old}-2025"}` },
    ])
    expect(query(opencodeDb(), "pragma integrity_check")).toEqual([{ integrity_check: "ok" }])
    expect(rowsOf(contextDb(), "select session_id, project_path from session_projects order by session_id")).toEqual([
      { session_id: "ses_a", project_path: `git:${root}` },
      { session_id: "ses_a_child", project_path: `git:${root}` },
      { session_id: "ses_other", project_path: "dir:other" },
    ])
    const memory = (project_path: string, content: string) => ({ project_path, content, normalized_hash: normalizedHash(content) })
    expect(rowsOf(contextDb(), "select project_path, content, normalized_hash from memories order by id")).toEqual([
      memory("git:old", `build with ${moved}/make.sh`),
      memory("git:old", `tests in ${old}/t`),
      memory("git:old", `tests in ${moved}/t`),
      memory(`git:${root}`, `build with ${moved}/make.sh`),
      memory(`git:${root}`, `tests in ${moved}/t`),
    ])
    expect(rowsOf(contextDb(), "select content from compartments order by session_id")).toEqual([{ content: `worked in ${moved}/src` }, { content: `compared with ${moved}` }])
    expect(rowsOf(contextDb(), "select session_id, cached_m0_bytes from session_meta order by session_id")).toEqual([
      { session_id: "ses_a", cached_m0_bytes: null },
      { session_id: "ses_other", cached_m0_bytes: null },
    ])

    // Again: nothing is left to move or rewrite, so nothing is replaced.
    const again = await cli(["relocate", "--data", at("data"), ...mapOf(old, moved), "--all", "--json"])
    expect([again.code, again.json.sessions, again.json.backup_dir]).toEqual([0, [], null])

    expect((await cli(["rollback", backup, "--db", opencodeDb(), "--db", contextDb()])).code).toBe(0)
    expect([fileSha(opencodeDb()), fileSha(contextDb())]).toEqual(before)
    expect(readdirSync(at("data", "opencode")).filter((name) => name.startsWith("relocate-backup-"))).toEqual([`relocate-backup-${STAMP}`])
  })

  it("moves named sessions only, rewriting only their rows", async () => {
    const { old, moved } = makeProfile()
    const run = await cli(["relocate", "--data", at("data"), ...mapOf(old, moved), "--session", "ses_a_child", "--session", "ses_other", "--json"])
    expect(run.code).toBe(0)
    expect(run.json.sessions.map((session: { id: string }) => session.id)).toEqual(["ses_a", "ses_a_child"])
    expect(run.json.skipped).toEqual([{ id: "ses_other", directory: join(at("home"), "elsewhere"), reason: "not-mapped", to_directory: null }])
    expect(query(opencodeDb(), "select data from session_message where id = 'ses_other-m0'")[0]).toMatchObject({ data: expect.stringContaining(`${old}/README.md`) })
  })

  it("names the destination project as OpenCode does: a repository's stored id, else its first root commit; a plain folder by its real path", async () => {
    const { home, old } = makeProfile()
    const stored = join(home, "repos", "stored")
    makeRepository(stored, { commit: true })
    writeFileSync(join(stored, ".git", "opencode"), "stored-project-id\n")
    const local = join(home, "repos", "local")
    makeRepository(local, { commit: true })
    const localRoot = spawnSync("git", ["-C", local, "rev-list", "--max-parents=0", "HEAD"], { encoding: "utf8" }).stdout.trim()
    const plain = join(home, "plain")
    for (const folder of [stored, local, plain]) mkdirSync(join(folder, "sub"), { recursive: true })
    const projectOf = async (target: string) => {
      const dry = await cli(["relocate", "--data", at("data"), ...mapOf(old, target), "--session", "ses_a", "--dry-run", "--json"])
      expect(dry.code).toBe(0)
      return dry.json.sessions.find((session: { id: string }) => session.id === "ses_a").to_project
    }
    expect(await projectOf(stored)).toBe("stored-project-id")
    expect(await projectOf(local)).toBe(localRoot)
    expect(await projectOf(plain)).toBe(sha1(`directory:${realpathSync(plain)}`))
  })

  it("refuses copies that fail a check (a text the rule cannot rewrite safely); a dry run reports it", async () => {
    const { old, moved } = makeProfile()
    // The folder glued to a word: no rule rewrites inside a name, so it would stay.
    const db = new Database(opencodeDb())
    db.query("update session_message set data = ? where id = 'ses_other-m1'").run(`{"text":"a${old.slice(1)}"}`)
    db.close()
    const context = new Database(contextDb())
    context.query("update compartments set content = ? where session_id = 'ses_other'").run(`a${old.slice(1)}`)
    context.close()
    const before = [fileSha(opencodeDb()), fileSha(contextDb())]
    const dry = await cli(["relocate", "--data", at("data"), ...mapOf(old, moved), "--all", "--dry-run", "--json"])
    expect([dry.code, dry.json.failed, dry.json.text.residual, dry.json.context_text.residual]).toEqual([1, ["text_ok", "context text_ok"], { session_message: 1 }, { compartments: 1 }])
    const run = await cli(["relocate", "--data", at("data"), ...mapOf(old, moved), "--all"])
    expect([run.code, run.errors]).toEqual([1, ["ERROR: the relocated copies failed text_ok, context text_ok; the profile's stores were left untouched"]])
    expect([fileSha(opencodeDb()), fileSha(contextDb())]).toEqual(before)
  })

  it("refuses bad rules, a held store, and a session Magic Context is wrapping up, writing nothing", async () => {
    const { old, moved } = makeProfile(`update session_meta set wrapup_in_progress_state = '{"expiresAt":9999999999999}' where session_id = 'ses_a'`)
    const before = [fileSha(opencodeDb()), fileSha(contextDb())]
    const usage = await cli(["relocate", "--all"])
    expect([usage.code, usage.text]).toEqual([2, "usage: opencode-session-manager relocate [--data <dataHome>] --map <from>=<to>... (--session <id>... | --all) [--dry-run] [--json]"])
    expect((await cli(["relocate", "--data", at("data"), "--map", "C:\\Users\\Me=/x", "--all"])).errors[0]).toContain("relocate moves POSIX folders")
    const busy = await cli(["relocate", "--data", at("data"), ...mapOf(old, moved), "--all"])
    expect(busy.errors[0]).toContain("Magic Context is working on ses_a")
    const holder = new Database(opencodeDb())
    try {
      expect((await cli(["relocate", "--data", at("data"), ...mapOf(old, moved), "--all"])).errors[0]).toContain("is held open by")
    } finally {
      holder.close()
    }
    expect([fileSha(opencodeDb()), fileSha(contextDb())]).toEqual(before)
    expect(readdirSync(at("data", "opencode")).filter((name) => name.includes("lock") || name.startsWith("relocate-backup-"))).toEqual([])
  })
})
