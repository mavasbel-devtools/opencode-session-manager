import { after, before, test } from "node:test"
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, copyFileSync, readdirSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { defaultDatabasePath } from "#domain/model/Database.ts"
import { GitProjectIdentityAdapter } from "#infrastructure/adapters/outbound/GitProjectIdentityAdapter.ts"
import { snapshotDatabase } from "#test/live/snapshot.ts"
import { query } from "#test/support/migration.ts"
import { removeTemporary, temporaryWorkspace } from "#test/support/temporary.ts"

/**
 * Rehearses a real migration: a read-only snapshot of this machine's `opencode.db` and of a
 * Windows `opencode.db` named by the environment, run through the real CLI as a process; then,
 * when an `opencode` binary is available, a fully sandboxed OpenCode lists the home folder's
 * sessions from the migrated copy. Nothing here can write the live database.
 *
 *   OPENCODE_DB_MIGRATE_LIVE_SOURCE   the Windows opencode.db (required, or the tests skip)
 *   OPENCODE_DB_MIGRATE_LIVE_USER     the Windows user name (required)
 *   OPENCODE_DB_MIGRATE_LIVE_MOUNT    where the Windows drive is mounted (optional)
 *   OPENCODE_BIN                      the opencode binary (optional; default `opencode` on PATH)
 */
const liveDatabase = defaultDatabasePath({ XDG_DATA_HOME: process.env["XDG_DATA_HOME"] }, homedir())
const source = process.env["OPENCODE_DB_MIGRATE_LIVE_SOURCE"]
const user = process.env["OPENCODE_DB_MIGRATE_LIVE_USER"]
const mount = process.env["OPENCODE_DB_MIGRATE_LIVE_MOUNT"]
const opencode = process.env["OPENCODE_BIN"] ?? "opencode"
const skip =
  !existsSync(liveDatabase)
    ? `no OpenCode database at ${liveDatabase}`
    : source === undefined || user === undefined || !existsSync(source)
      ? "set OPENCODE_DB_MIGRATE_LIVE_SOURCE and OPENCODE_DB_MIGRATE_LIVE_USER to rehearse a real migration"
      : false
const hasOpencode = spawnSync(opencode, ["--version"], { encoding: "utf8" }).status === 0
const cli = fileURLToPath(new URL("../../src/main/cli.ts", import.meta.url))

let directory: string
let migrated: string
let stdout: string

before(async () => {
  if (skip !== false) return
  directory = temporaryWorkspace("oc-migrate-live-")
  const snapshot = join(directory, "opencode.db")
  const windows = join(directory, "windows.db")
  await snapshotDatabase(liveDatabase, snapshot)
  await snapshotDatabase(source as string, windows)
  const result = spawnSync(
    process.execPath,
    [
      "--no-warnings",
      cli,
      "migrate",
      "rehearse",
      "--keep",
      "--db",
      snapshot,
      "--from",
      windows,
      "--windows-user",
      user as string,
      ...(mount === undefined ? [] : ["--mount", mount]),
    ],
    {
      encoding: "utf8",
      env: { ...process.env, OPENCODE_DB_MIGRATE_REHEARSAL_DIR: join(directory, "rehearsal") },
      maxBuffer: 64 * 1024 * 1024,
    },
  )
  stdout = `${result.stdout}${result.stderr}`
  const line = result.stdout.split("\n").find((entry) => entry.startsWith("REHEARSAL OK migrated="))
  migrated = line?.slice("REHEARSAL OK migrated=".length) ?? ""
})

after(() => {
  removeTemporary(directory)
})

test("a real migration rehearses with every gate passing", { skip }, () => {
  assert.ok(existsSync(migrated), stdout)
  for (const gate of ["integrity_ok", "foreign_keys_ok", "rows_kept", "windows_sessions_gone", "structured_paths_clean"]) {
    assert.ok(stdout.includes(`PASS ${gate}`), `${gate}\n${stdout}`)
  }
  const windowsFolders = query<{ n: number }>(
    migrated,
    "select count(*) as n from session_v2 where directory glob '[A-Za-z]:*' or directory like '%\\%' escape '!'",
  )
  assert.equal(windowsFolders[0]?.n, 0)
})

test("a sandboxed OpenCode lists the home folder's sessions from the migrated copy", {
  skip: skip !== false ? skip : hasOpencode ? false : `no opencode binary (${opencode})`,
}, () => {
  const sandbox = join(directory, "sandbox")
  for (const folder of ["data/opencode", "state", "cache", "config/opencode"]) mkdirSync(join(sandbox, folder), { recursive: true })
  copyFileSync(migrated, join(sandbox, "data", "opencode", "opencode.db"))
  const listed = spawnSync(opencode, ["session", "list", "--standalone", "--format", "json", "-n", "100000"], {
    cwd: homedir(),
    encoding: "utf8",
    timeout: 180_000,
    maxBuffer: 64 * 1024 * 1024,
    env: {
      ...process.env,
      XDG_DATA_HOME: join(sandbox, "data"),
      XDG_STATE_HOME: join(sandbox, "state"),
      XDG_CACHE_HOME: join(sandbox, "cache"),
      XDG_CONFIG_HOME: join(sandbox, "config"),
    },
  })
  assert.equal(listed.status, 0, listed.stderr)
  const sessions = JSON.parse(listed.stdout) as unknown[]
  const home = new GitProjectIdentityAdapter().resolve(homedir())
  assert.ok(home !== null)
  const columns = query<{ name: string }>(migrated, "pragma table_info(session_v2)").map((column) => column.name)
  const filters = ["project_id = ?"]
  if (columns.includes("parent_id")) filters.push("parent_id is null")
  if (columns.includes("time_archived")) filters.push("time_archived is null")
  const expected = query<{ n: number }>(migrated, `select count(*) as n from session_v2 where ${filters.join(" and ")}`, home.id)
  assert.equal(sessions.length, expected[0]?.n)
  assert.ok(readdirSync(join(sandbox, "data", "opencode")).includes("opencode.db"), "the sandbox used its own copy")
})
