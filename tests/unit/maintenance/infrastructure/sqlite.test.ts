import { test } from "bun:test"
import assert from "node:assert/strict"
import { chmodSync, existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Database } from "bun:sqlite"
import { BunSqliteAdapter } from "@session-manager/infrastructure/adapters/outbound/sqlite/BunSqliteAdapter"
import { fileSha, makeDatabase, makePlainDatabase } from "@test/support/maintenance/database"

const adapter = new BunSqliteAdapter()

test("pageStats and journalMode read the real file", () => {
  const directory = mkdtempSync(join(tmpdir(), "oc-compact-sqlite-"))
  try {
    const file = join(directory, "opencode.db")
    makePlainDatabase(file)
    assert.equal(adapter.journalMode(file), "delete")
    const plain = adapter.pageStats(file)
    assert.equal(plain.logical_bytes, plain.page_size * plain.page_count)
    assert.equal(plain.free_bytes, plain.page_size * plain.freelist_count)
    assert.equal(plain.auto_vacuum, 0)

    adapter.setWal(file)
    assert.equal(adapter.journalMode(file), "wal")

    const wal = join(directory, "wal.db")
    makeDatabase(wal)
    const stats = adapter.pageStats(wal)
    assert.ok(stats.free_bytes > 0, "the delete left free pages")
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test("fingerprint is deterministic and encodes blobs, int64 and every key shape", () => {
  const directory = mkdtempSync(join(tmpdir(), "oc-compact-sqlite-"))
  try {
    const file = join(directory, "opencode.db")
    makeDatabase(file)
    const first = adapter.fingerprint(file)
    assert.deepEqual(first, adapter.fingerprint(file))
    assert.equal(first.header.userVersion, 7)
    assert.equal(first.header.applicationId, 0)
    assert.equal(first.tables["session_v2"]?.rows, 12)
    assert.equal(first.tables["session_message"]?.rows, 600)
    assert.equal(first.tables["nopk"]?.rows, 2, "a table without a primary key is ordered by all columns")
    assert.equal(first.tables["project"]?.rows, 2)
    assert.equal(first.tables["instruction_entry"]?.rows, 3)
    assert.equal(first.tables["seq"]?.rows, 1)
    assert.deepEqual(first.schema.map((entry) => entry.name).includes("session_message_seq"), true)

    const db = new Database(file)
    db.exec("update session_v2 set big = big + 1 where id = 'ses_0'")
    db.close()
    assert.notEqual(adapter.fingerprint(file).tables["session_v2"]?.sha256, first.tables["session_v2"]?.sha256)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test("integrity reports ok with no foreign-key violations", () => {
  const directory = mkdtempSync(join(tmpdir(), "oc-compact-sqlite-"))
  try {
    const file = join(directory, "opencode.db")
    makeDatabase(file)
    assert.deepEqual(adapter.integrity(file), { integrity_ok: true, integrity: ["ok"], foreign_key_violations: 0 })
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test("integrity passes for a WAL database without its sidecar files", () => {
  const directory = mkdtempSync(join(tmpdir(), "oc-compact-sqlite-"))
  try {
    const file = join(directory, "opencode.db")
    makeDatabase(file)
    rmSync(`${file}-wal`, { force: true })
    rmSync(`${file}-shm`, { force: true })
    const before = fileSha(file)
    assert.deepEqual(adapter.integrity(file), { integrity_ok: true, integrity: ["ok"], foreign_key_violations: 0 })
    assert.equal(fileSha(file), before, "the check does not write the store")
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test("integrity passes where SQLite cannot open read-only, through a private copy", () => {
  const directory = mkdtempSync(join(tmpdir(), "oc-compact-sqlite-"))
  try {
    const file = join(directory, "opencode.db")
    makeDatabase(file)
    rmSync(`${file}-wal`, { force: true })
    rmSync(`${file}-shm`, { force: true })
    chmodSync(directory, 0o555)
    try {
      assert.deepEqual(adapter.integrity(file), { integrity_ok: true, integrity: ["ok"], foreign_key_violations: 0 })
      assert.deepEqual(readdirSync(directory), ["opencode.db"], "the check leaves the store's folder untouched")
    } finally {
      chmodSync(directory, 0o755)
    }
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test("integrity reports a file that is not a database instead of passing it", () => {
  const directory = mkdtempSync(join(tmpdir(), "oc-compact-sqlite-"))
  try {
    const file = join(directory, "opencode.db")
    writeFileSync(file, "not a database")
    assert.throws(() => adapter.integrity(file), /file is not a database/)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test("vacuumInto compacts without writing the source, and refuses an existing target", () => {
  const directory = mkdtempSync(join(tmpdir(), "oc-compact-sqlite-"))
  try {
    const source = join(directory, "opencode.db")
    makeDatabase(source)
    const before = fileSha(source)
    const target = join(directory, "compact.db")
    adapter.vacuumInto(source, target)
    assert.equal(fileSha(source), before, "the source file is byte-identical after the run")
    assert.equal(adapter.pageStats(target).freelist_count, 0)
    assert.ok(adapter.pageStats(target).logical_bytes < adapter.pageStats(source).logical_bytes)

    writeFileSync(join(directory, "exists.db"), "")
    assert.throws(() => adapter.vacuumInto(source, join(directory, "exists.db")), /refusing to overwrite/)

    const missing = join(directory, "gone.db")
    assert.equal(existsSync(missing), false)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
