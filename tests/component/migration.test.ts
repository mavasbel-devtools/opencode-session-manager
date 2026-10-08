import { test } from "node:test"
import assert from "node:assert/strict"
import { join } from "node:path"
import { MigrationVerifier } from "#application/MigrationVerifier.ts"
import { RekeyService } from "#application/RekeyService.ts"
import { RewriteService } from "#application/RewriteService.ts"
import { PathRewriter } from "#domain/services/PathRewriter.ts"
import { GitProjectIdentityAdapter } from "#infrastructure/adapters/outbound/GitProjectIdentityAdapter.ts"
import { NodeMigrationStoreAdapter } from "#infrastructure/adapters/outbound/NodeMigrationStoreAdapter.ts"
import { NodeSqliteAdapter } from "#infrastructure/adapters/outbound/NodeSqliteAdapter.ts"
import { fileSha } from "#test/support/database.ts"
import { FakeRuntime } from "#test/support/fakes/runtime.ts"
import { makeMigrationWorld, MOUNT, query, WINDOWS_USER } from "#test/support/migration.ts"
import { removeTemporary, temporaryWorkspace } from "#test/support/temporary.ts"

test("component: rewrite, merge, re-key and verify on real copies with real folders and real git", () => {
  const directory = temporaryWorkspace("oc-migrate-component-")
  try {
    const world = makeMigrationWorld(directory)
    const sqlite = new NodeSqliteAdapter()
    const store = new NodeMigrationStoreAdapter()
    const identity = new GitProjectIdentityAdapter()
    const rewriter = new PathRewriter({
      home: world.home,
      windowsUser: WINDOWS_USER,
      drive: "C",
      mounts: [MOUNT],
      relocations: [world.moved],
    })
    const before = { live: fileSha(world.live), windows: fileSha(world.windows) }
    const base = join(directory, "base.db")
    const source = join(directory, "source.db")
    sqlite.vacuumInto(world.live, base)
    sqlite.vacuumInto(world.windows, source)

    const rewrites = [base, source].map((copy) => {
      const db = store.open(copy)
      try {
        return new RewriteService().rewrite(db, rewriter, copy)
      } finally {
        db.close()
      }
    })
    assert.ok((rewrites[1]?.cells_rewritten ?? 0) > 10)

    const db = store.open(base)
    try {
      const merged = db.merge(source)
      assert.equal(merged.find((table) => table.name === "session_v2")?.inserted, 10)
      const rekey = new RekeyService(identity, new FakeRuntime()).rekey(db)
      assert.ok(rekey.sessions_rekeyed > 0)
      const verification = new MigrationVerifier(sqlite, identity).verify({
        db,
        dbPath: base,
        inputs: [source],
        rewrites,
        rewriter,
      })
      assert.equal(verification.ok, true, JSON.stringify(verification, null, 2))
    } finally {
      db.close()
    }

    // Every session's project is the one this machine derives for its folder, when the folder exists.
    for (const row of query<{ directory: string; project_id: string }>(base, "select directory, project_id from session_v2")) {
      const derived = identity.resolve(row.directory)
      if (derived !== null) assert.equal(row.project_id, derived.id, row.directory)
    }
    assert.deepEqual(before, { live: fileSha(world.live), windows: fileSha(world.windows) }, "the inputs are never written")
  } finally {
    removeTemporary(directory)
  }
})
