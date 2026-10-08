import { test } from "node:test"
import assert from "node:assert/strict"
import type { Fingerprint } from "#domain/model/Database.ts"
import { FingerprintComparer } from "#domain/services/FingerprintComparer.ts"
import { ParityPolicy } from "#domain/services/ParityPolicy.ts"
import { RequiredSpacePolicy } from "#domain/services/RequiredSpacePolicy.ts"

const base: Fingerprint = {
  schema: [{ type: "table", name: "t", tblName: "t", sql: "create table t(x)" }],
  header: { userVersion: 7, applicationId: 0 },
  tables: { t: { rows: 2, sha256: "aa" }, u: { rows: 1, sha256: "bb" } },
}

const clone = (): Fingerprint => JSON.parse(JSON.stringify(base)) as Fingerprint

test("equal fingerprints compare ok with one row per table", () => {
  const result = new FingerprintComparer().compare(base, clone())
  assert.equal(result.ok, true)
  assert.deepEqual(result.failures, [])
  assert.deepEqual(result.tables.map((table) => table.name), ["t", "u"])
  assert.deepEqual(result.tables[0], { name: "t", source_rows: 2, target_rows: 2, match: true })
})

test("schema, header, content and missing tables are each named", () => {
  const other: Fingerprint = {
    schema: [],
    header: { userVersion: 8, applicationId: 1 },
    tables: { t: { rows: 2, sha256: "zz" }, v: { rows: 0, sha256: "cc" } },
  }
  const result = new FingerprintComparer().compare(base, other)
  assert.equal(result.ok, false)
  assert.deepEqual(result.failures, [
    "schema differs",
    "user_version/application_id differ",
    "table t differs",
    "table u differs",
    "table v differs",
  ])
  assert.deepEqual(result.tables.find((table) => table.name === "u"), {
    name: "u",
    source_rows: 1,
    target_rows: null,
    match: false,
  })
  assert.deepEqual(result.tables.find((table) => table.name === "v"), {
    name: "v",
    source_rows: null,
    target_rows: 0,
    match: false,
  })
})

const checks = {
  integrity_ok: true,
  foreign_keys_ok: true,
  freelist_zero: true,
  parity_ok: true,
  journal_wal: true,
  no_target_sidecars: true,
}

test("a strict run requires parity, a loose one ignores it", () => {
  const policy = new ParityPolicy()
  assert.equal(policy.ok(checks, true), true)
  assert.equal(policy.ok({ ...checks, parity_ok: false }, true), false)
  assert.equal(policy.ok({ ...checks, parity_ok: false }, false), true)
  assert.equal(policy.ok({ ...checks, freelist_zero: false }, false), false)
})

test("required space is twice the compacted size plus the WAL", () => {
  const policy = new RequiredSpacePolicy()
  const pages = { page_size: 4096, page_count: 100, freelist_count: 25, logical_bytes: 409600, free_bytes: 102400, auto_vacuum: 0 }
  assert.equal(policy.requiredBytes(pages, 500), 2 * (409600 - 102400) + 500)
  assert.equal(policy.requiredBytes(pages, 0), 614400)
})
