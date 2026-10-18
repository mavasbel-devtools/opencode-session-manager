import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { Database } from "bun:sqlite"
import { join } from "node:path"
import type { TextRewrite } from "@session-manager/domain/ports/outbound/RelocationStorePort"
import { NameRewriter } from "@session-manager/domain/services/NameRewriter"
import { PathRewriter } from "@session-manager/domain/services/PathRewriter"
import { relocationsFromRules } from "@session-manager/domain/services/RelocateRules"
import { withStore } from "@session-manager/infrastructure/adapters/outbound/sqlite/engine/Store"
import { instructionHash, rewriteInstructionBlobs } from "@session-manager/infrastructure/adapters/outbound/sqlite/InstructionBlobs"
import { removeTemporary, temporaryWorkspace } from "@test/support/maintenance/temporary"
import { makeOpenCode2Store } from "@test/support/sessions/opencode-stores"
import fixture from "@test/support/sessions/instruction-blobs.json"

let directory = ""
beforeEach(() => {
  directory = temporaryWorkspace("oc-instruction-blobs-")
})
afterEach(() => {
  removeTemporary(directory)
})

const relocations = relocationsFromRules([{ from: "/old/rel", to: "/new/rel" }], "/home/me")
const rewrite = (overrides: Partial<TextRewrite> = {}): TextRewrite => ({ rewriter: new PathRewriter(relocations.mapping), hints: relocations.hints, names: null, scope: "all", ...overrides })
const rows = (file: string, sql: string) => {
  const db = new Database(file, { readonly: true })
  try {
    return db.query(sql).all()
  } finally {
    db.close()
  }
}
const state = (session: string, hash: string) => `insert into instruction_state values ('${session}', 0, 1, '{"core/environment":"${hash}"}', '{"core/environment":"${hash}","core/date":"d"}')`
const blob = (hash: string, value: unknown) => `insert into instruction_blob values ('${hash}', '${JSON.stringify(value).replaceAll("'", "''")}')`

function store(sql: readonly string[]): string {
  const file = join(directory, "opencode.db")
  makeOpenCode2Store(file, { sessions: [{ id: "ses_a", directory: "/old/rel" }, { id: "ses_b", directory: "/else" }], extraSql: sql.join(";\n") })
  return file
}

describe("instruction blob addresses", () => {
  it("are OpenCode's: sha256 of the canonical JSON (keys sorted), as OpenCode 2.0.26 stored them", () => {
    for (const entry of fixture.blobs) expect(instructionHash(JSON.parse(entry.value))).toBe(entry.hash)
    expect(instructionHash({ b: [1, { d: null, c: "é" }], a: true })).toBe(instructionHash({ a: true, b: [1, { c: "é", d: null }] }))
  })
})

describe("rewriteInstructionBlobs", () => {
  it("stores a rewritten value under its own address, repoints every state, and removes the old blob", () => {
    const file = store([blob("h_old", { cwd: "/old/rel" }), blob("h_keep", { cwd: "/else" }), state("ses_a", "h_old"), state("ses_b", "h_keep")])
    const result = withStore(file, "write", (db) => rewriteInstructionBlobs(db, db.orm, rewrite(), null))
    const moved = instructionHash({ cwd: "/new/rel" })
    expect(result).toEqual({ rows: 1, residual: 0 })
    expect(rows(file, "select hash, value from instruction_blob order by value")).toEqual([
      { hash: "h_keep", value: JSON.stringify({ cwd: "/else" }) },
      { hash: moved, value: JSON.stringify({ cwd: "/new/rel" }) },
    ])
    expect(rows(file, "select session_id, initial_values, current_values from instruction_state order by session_id")).toEqual([
      { session_id: "ses_a", initial_values: JSON.stringify({ "core/environment": moved }), current_values: JSON.stringify({ "core/environment": moved, "core/date": "d" }) },
      { session_id: "ses_b", initial_values: '{"core/environment":"h_keep"}', current_values: '{"core/environment":"h_keep","core/date":"d"}' },
    ])
  })

  it("in a session scope: only blobs those sessions point at, and an old blob another session points at stays", () => {
    const file = store([blob("h_shared", { cwd: "/old/rel" }), blob("h_other", { cwd: "/old/rel/x" }), state("ses_a", "h_shared"), state("ses_b", "h_shared")])
    const result = withStore(file, "write", (db) => rewriteInstructionBlobs(db, db.orm, rewrite({ scope: { sessions: ["ses_a"] } }), ["ses_a"]))
    expect(result).toEqual({ rows: 1, residual: 0 })
    expect(rows(file, "select hash from instruction_blob order by hash").map((row) => (row as { hash: string }).hash).sort()).toEqual([instructionHash({ cwd: "/new/rel" }), "h_other", "h_shared"].sort())
    expect(rows(file, "select current_values from instruction_state where session_id = 'ses_b'")).toEqual([{ current_values: '{"core/environment":"h_shared","core/date":"d"}' }])
  })

  it("joins a blob that already has the new value, counts what is left or is no JSON, and changes nothing without hints", () => {
    const moved = instructionHash({ cwd: "/new/rel" })
    const file = store([
      blob("h_old", { cwd: "/old/rel" }),
      blob(moved, { cwd: "/new/rel" }),
      // Renamed to the text `/new/rel"` plus a stray quote: no JSON once rewritten.
      `insert into instruction_blob values ('h_bad', '"/old/rel')`,
      blob("h_same", "/old/relx"),
      state("ses_a", "h_old"),
    ])
    const left = new NameRewriter([{ parent: "/new", from: "rel", to: "rel2" }])
    const residual: TextRewrite = { ...rewrite(), rewriter: { rewrite: (text) => new PathRewriter(relocations.mapping).rewrite(text), residual: (text) => left.residual(text) } }
    const result = withStore(file, "write", (db) => rewriteInstructionBlobs(db, db.orm, residual, null))
    expect(result).toEqual({ rows: 1, residual: 2 })
    expect(rows(file, "select hash from instruction_blob order by hash").map((row) => (row as { hash: string }).hash).sort()).toEqual([moved, "h_bad", "h_same"].sort())
    expect(withStore(file, "write", (db) => rewriteInstructionBlobs(db, db.orm, { ...rewrite(), hints: [] }, null))).toEqual({ rows: 0, residual: 0 })
  })

  it("does nothing in a store without instruction tables", () => {
    const file = join(directory, "bare.db")
    new Database(file).close()
    expect(withStore(file, "write", (db) => rewriteInstructionBlobs(db, db.orm, rewrite(), null))).toEqual({ rows: 0, residual: 0 })
  })
})
