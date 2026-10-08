import { afterEach, beforeEach, test } from "bun:test"
import assert from "node:assert/strict"
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { Database } from "bun:sqlite"
import { bootstrap } from "@session-manager/main/cli/cli"
import { buildContainer } from "@session-manager/main/cli-container"
import type { CliEnvironment } from "@session-manager/infrastructure/adapters/inbound/cli/CompactCliAdapter"
import { captureConsole, captureConsoleError } from "@test/support/maintenance/console"
import { fileSha } from "@test/support/maintenance/database"
import { makeMigrationWorld, MOUNT, query, sha1, WINDOWS_USER, type MigrationWorld } from "@test/support/maintenance/migration"
import { removeTemporary, temporaryWorkspace } from "@test/support/maintenance/temporary"

let directory: string
let world: MigrationWorld

beforeEach(() => {
  directory = temporaryWorkspace("oc-migrate-e2e-")
  world = makeMigrationWorld(directory)
})
afterEach(() => {
  removeTemporary(directory)
})

function environment(): CliEnvironment {
  return {
    OPENCODE_DB_COMPACT_IMAGE: "no-such-image-opencode-db-manager",
    OPENCODE_DB_MIGRATE_REHEARSAL_DIR: join(directory, "rehearsal"),
  }
}

function migrateArgs(mode: string, ...extra: string[]): string[] {
  return [
    "migrate",
    mode,
    "--db",
    world.live,
    "--from",
    world.windows,
    "--windows-user",
    WINDOWS_USER,
    "--mount",
    MOUNT,
    "--home",
    world.home,
    "--relocate",
    `${world.moved.from}=${world.moved.to}`,
    ...extra,
  ]
}

async function runCli(argv: readonly string[]): Promise<{ code: number; lines: string[] }> {
  const capture = captureConsole()
  try {
    return { code: (await buildContainer(environment())).run(argv), lines: capture.lines }
  } finally {
    capture.restore()
  }
}

function workFolders(parent: string): string[] {
  return readdirSync(parent).filter((name) => name.startsWith("opencode.db.migrate-"))
}

const ALL_PASS = [
  "PASS integrity_ok",
  "PASS foreign_keys_ok",
  "PASS rows_kept",
  "PASS windows_sessions_gone",
  "PASS structured_paths_clean",
  "PASS subpaths_consistent",
  "PASS json_intact",
]

test("migrate rehearse proves the migration on copies and leaves only the report behind", async () => {
  const live = fileSha(world.live)
  const windows = fileSha(world.windows)
  const { code, lines } = await runCli(migrateArgs("rehearse"))
  assert.equal(code, 0, lines.join("\n"))
  for (const line of ALL_PASS) assert.ok(lines.includes(line), line)
  assert.ok(lines.includes("REHEARSAL OK"))
  assert.ok(lines.includes(`source: ${world.windows}`))
  assert.ok(lines.some((line) => line.startsWith("session folders missing on this machine: ")))
  assert.ok(lines.includes("  residual: part.data 1"), "the glued drive is reported, not rewritten")
  assert.equal(fileSha(world.live), live)
  assert.equal(fileSha(world.windows), windows)
  const [work] = workFolders(join(directory, "rehearsal"))
  assert.ok(work !== undefined)
  assert.deepEqual(readdirSync(join(directory, "rehearsal", work)), ["report.json"])
  const report = JSON.parse(readFileSync(join(directory, "rehearsal", work, "report.json"), "utf8")) as {
    mode: string
    swapped: boolean
    rekey: { missing_directories: string[] }
  }
  assert.equal(report.mode, "migrate-rehearse")
  assert.equal(report.swapped, false)
  assert.ok(report.rekey.missing_directories.includes(join(world.home, "Hg")))
  assert.ok(report.rekey.missing_directories.includes(join(world.home, "afile")))
})

test("migrate rehearse --keep: every session lands under home with the project OpenCode derives here", async () => {
  const { code, lines } = await runCli(migrateArgs("rehearse", "--keep"))
  assert.equal(code, 0, lines.join("\n"))
  const kept = lines.find((line) => line.startsWith("REHEARSAL OK migrated="))
  const migrated = kept?.slice("REHEARSAL OK migrated=".length) ?? ""
  assert.ok(existsSync(migrated))

  const sessions = Object.fromEntries(
    query<{ id: string; project_id: string; directory: string; path: string | null }>(
      migrated,
      "select id, project_id, directory, path from session union all select id, project_id, directory, path from session_v2",
    ).map((row) => [row.id, [row.project_id, row.directory, row.path]]),
  )
  const home = world.home
  assert.deepEqual(sessions["ses_l1"], [world.ids.liveHome, home, null])
  assert.deepEqual(sessions["ses_l2"], [world.ids.repo, join(home, "Dev", "repo"), null], "the mounted Windows folder too")
  assert.deepEqual(sessions["ses_w1"], [world.ids.repo, join(home, "Dev", "repo", "sub"), "sub"])
  assert.deepEqual(sessions["ses_w2"], [world.ids.liveHome, home, null])
  assert.deepEqual(sessions["ses_w3"], [world.ids.notes, join(home, "Notes"), null])
  assert.deepEqual(sessions["ses_w4"], [world.ids.moved, world.moved.to, null], "relocated")
  assert.deepEqual(sessions["ses_w5"], ["wingone", join(home, "Gone", "x"), "x"], "a missing folder keeps its project")
  assert.deepEqual(sessions["ses_w6"], ["global", join(home, "Elsewhere"), join(home, "Elsewhere").slice(1)])
  assert.deepEqual(sessions["ses_w7"], ["global", join(home, "Hg"), join(home, "Hg").slice(1)])
  assert.deepEqual(sessions["ses_w8"], [world.ids.stored, join(home, "Stored"), null])
  assert.deepEqual(sessions["ses_w9"], ["global", join(home, "Empty"), join(home, "Empty").slice(1)])
  assert.deepEqual(sessions["ses_w10"], [world.ids.scp, join(home, "Scp"), null])
  assert.deepEqual(sessions["ses_w12"], ["wingone", join(home, "Gone", "y", "z"), "y/z"], "subpath recomputed")

  const projects = Object.fromEntries(
    query<{ id: string; worktree: string; name: string | null }>(migrated, "select id, worktree, name from project").map((row) => [
      row.id,
      row,
    ]),
  )
  assert.equal(projects["global"]?.worktree, "/", "the global project stays at the root")
  assert.equal(projects[world.ids.repo]?.name, "Repo (old clone)", "a project already known here keeps its row")
  assert.equal(projects[world.ids.repo]?.worktree, join(home, "Dev", "repo"), "and takes the worktree derived here")
  assert.equal(projects["winrepo"], undefined)
  assert.equal(projects["wingone"]?.worktree, join(home, "Gone"))
  assert.equal(sha1(`directory:${projects[world.ids.notes]?.worktree}`), world.ids.notes)

  assert.deepEqual(
    query<{ project_id: string }>(migrated, "select project_id from permission").map((row) => row.project_id).sort(),
    [world.ids.liveHome, world.ids.moved, world.ids.repo].sort(),
  )
  assert.deepEqual(query(migrated, "select directory from project_directory"), [{ directory: join(home, "Dev", "repo") }])
  const message = query<{ data: string }>(migrated, "select data from message where id = 'msg_w1'")[0]?.data
  assert.equal(message, `{"path":{"cwd":"${join(home, "Dev", "repo", "sub")}","root":"/"},"n":12345678901234567890}`)
  const note = query<{ data: string }>(migrated, "select data from session_message where id = 'msg_w3'")[0]?.data
  assert.equal(note, `{"text":"see @fs${join(home, "Notes", "b.md")} and ${join(world.moved.to, "c.md")}"}`)
  assert.deepEqual(query(migrated, "select secret from credential"), [{ secret: "C:/Users/Robin/.secret" }])
  assert.deepEqual(query(migrated, "select value from kv order by key"), [{ value: "linux" }, { value: `${home}/x` }])
  assert.deepEqual(query(migrated, "pragma journal_mode"), [{ journal_mode: "wal" }])
})

test("migrate run swaps the migrated database in, and rollback restores the original", async () => {
  const original = fileSha(world.live)
  const { code, lines } = await runCli(migrateArgs("run"))
  assert.equal(code, 0, lines.join("\n"))
  const swapped = lines.find((line) => line.startsWith("SWAPPED backup="))
  assert.match(swapped ?? "", /post_integrity_ok=true$/)
  const backupDir = (swapped ?? "").split(" ")[1]?.slice("backup=".length) ?? ""
  assert.equal(fileSha(join(backupDir, "opencode.db")), original, "the original is kept byte for byte")
  assert.ok(existsSync(join(backupDir, "opencode.db-wal")))
  assert.ok(lines.includes(`undo: opencode-session-manager rollback ${backupDir} --db ${world.live}`))
  assert.deepEqual(workFolders(join(directory, "live")), [], "the work folder is gone")
  assert.equal(query(world.live, "select id from session_v2 where id = 'ses_w3'").length, 1)

  const rolledBack = await runCli(["rollback", backupDir, "--db", world.live])
  assert.equal(rolledBack.code, 0, rolledBack.lines.join("\n"))
  assert.equal(fileSha(world.live), original)
})

test("migrate run aborts before the swap when a session folder stays a Windows path", async () => {
  const windows = new Database(world.windows)
  windows.query("insert into session_v2 values ('ses_d', 'global', 'D:/Work', 'D:/Work', 'other drive')").run()
  windows.close()
  const original = fileSha(world.live)
  const { code, lines } = await runCli(migrateArgs("run"))
  assert.equal(code, 1)
  assert.ok(lines.includes("FAIL windows_sessions_gone"))
  assert.ok(lines.includes("  windows session folder: D:/Work"))
  const aborted = lines.find((line) => line.startsWith("ABORTED: originals untouched; migrated copy kept at "))
  assert.ok(aborted !== undefined)
  assert.ok(existsSync(aborted.slice(aborted.lastIndexOf(" ") + 1)))
  assert.equal(fileSha(world.live), original)
})

test("migrate reports rows the merge could not bring over, as a failed rehearsal", async () => {
  const live = new Database(world.live)
  live.exec("create unique index kv_value on kv(value)")
  live.close()
  const windows = new Database(world.windows)
  windows.query("insert into kv values ('taken', 'linux')").run()
  windows.close()
  const { code, lines } = await runCli(migrateArgs("rehearse"))
  assert.equal(code, 1)
  assert.ok(lines.includes("FAIL rows_kept"))
  assert.ok(lines.some((line) => line.startsWith("  missing: kv 1 rows from ") && line.endsWith("source-1.db")))
  assert.ok(lines.includes("REHEARSAL FAILED"))
})

test("migrate rolls a refused write back and reports it as an error, the live database untouched", async () => {
  const live = new Database(world.live)
  live.exec("create trigger no_new_projects before insert on project begin select raise(abort, 'no new projects'); end")
  live.close()
  const original = fileSha(world.live)
  const out = captureConsole()
  const err = captureConsoleError()
  try {
    assert.equal(await bootstrap(migrateArgs("run"), environment()), 1)
  } finally {
    out.restore()
    err.restore()
  }
  assert.ok(err.lines.some((line) => line.includes("no new projects")), err.lines.join("\n"))
  assert.equal(fileSha(world.live), original)
})

test("migrate prints its usage and the problems for bad arguments", async () => {
  const { code, lines } = await runCli(["migrate", "run", "--from", world.windows, "--relocate", "nope", "--db", world.live])
  assert.equal(code, 2)
  assert.ok(lines.includes("--relocate expects <from>=<to>, got nope"))
  assert.match(lines.at(-1) ?? "", /^usage: opencode-session-manager migrate <rehearse\|run>/)
})
