import { after, before, test } from "node:test"
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { existsSync, readdirSync, statSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { defaultDatabasePath } from "#domain/model/Database.ts"
import { snapshotDatabase } from "#test/live/snapshot.ts"
import { removeTemporary, temporaryWorkspace } from "#test/support/temporary.ts"

const NO_IMAGE = "no-such-image-opencode-db-compact.exe"
const liveDatabase = defaultDatabasePath({ XDG_DATA_HOME: process.env["XDG_DATA_HOME"] }, homedir())
const available = existsSync(liveDatabase)
const skip = available ? false : `no OpenCode database at ${liveDatabase}`
const cli = fileURLToPath(new URL("../../src/main/cli.ts", import.meta.url))

let directory: string
let snapshot: string
let originalBytes: number

before(async () => {
  if (!available) return
  directory = temporaryWorkspace("oc-compact-live-")
  snapshot = join(directory, "opencode.db")
  await snapshotDatabase(liveDatabase, snapshot)
  originalBytes = statSync(snapshot).size
})

after(() => {
  removeTemporary(directory)
})

function cli_(args: readonly string[]): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, ["--no-warnings", cli, ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      OPENCODE_DB_COMPACT_IMAGE: NO_IMAGE,
      OPENCODE_DB_COMPACT_REHEARSAL_DIR: join(directory, "rehearsal"),
    },
  })
  return { status: result.status, stdout: result.stdout, stderr: result.stderr }
}

test("the live database is snapshotted read-only", { skip }, () => {
  assert.ok(originalBytes > 0, "the snapshot has content")
  assert.ok(existsSync(liveDatabase), "the live database is still there")
})

test("preflight on the live snapshot reports its real shape", { skip }, () => {
  const result = cli_(["preflight", "--db", snapshot])
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /"freelist_count": \d+/)
  const report = JSON.parse(result.stdout.slice(result.stdout.indexOf("{"))) as {
    files: Record<string, number | null>
    pages: { freelist_count: number; logical_bytes: number }
  }
  assert.equal(report.files["opencode.db"], originalBytes)
  assert.ok(report.pages.logical_bytes > 0)
})

test("a full run and rollback on the live snapshot reclaim space and restore it", { skip }, () => {
  const run = cli_(["run", "--db", snapshot])
  assert.equal(run.status, 0, run.stderr)
  assert.match(run.stdout, /SWAPPED backup=/)
  const compactedBytes = statSync(snapshot).size
  assert.ok(compactedBytes < originalBytes, `compacted ${compactedBytes} < original ${originalBytes}`)

  const backup = join(directory, readdirSync(directory).find((name) => name.startsWith("db-backup-")) ?? "")
  const rollback = cli_(["rollback", backup, "--db", snapshot])
  assert.equal(rollback.status, 0, rollback.stderr)
  assert.match(rollback.stdout, /ROLLED BACK restored=opencode\.db/)
  assert.equal(statSync(snapshot).size, originalBytes, "the original bytes are back")
})
