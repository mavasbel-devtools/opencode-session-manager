import { afterEach, beforeEach, test } from "bun:test"
import assert from "node:assert/strict"
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { Database } from "bun:sqlite"
import { GitProjectIdentityAdapter } from "@session-manager/infrastructure/adapters/outbound/project/GitProjectIdentityAdapter"
import { NodeMaintenanceFileSystemAdapter } from "@session-manager/infrastructure/adapters/outbound/fs/NodeMaintenanceFileSystemAdapter"
import { BunMigrationStoreAdapter } from "@session-manager/infrastructure/adapters/outbound/sqlite/BunMigrationStoreAdapter"
import { BIG_TIME, makeMigrationWorld, makeRepository, query, sha1 } from "@test/support/maintenance/migration"
import { removeTemporary, temporaryWorkspace } from "@test/support/maintenance/temporary"

let directory: string

beforeEach(() => {
  directory = temporaryWorkspace("oc-migrate-unit-")
})
afterEach(() => {
  removeTemporary(directory)
})

test("BunMigrationStoreAdapter reads tables, columns, sessions, projects and project references", () => {
  const world = makeMigrationWorld(directory)
  const db = new BunMigrationStoreAdapter().open(world.windows)
  try {
    assert.deepEqual(db.tables().slice(0, 3), ["project", "project_directory", "worktree"])
    assert.deepEqual(db.columns("worktree"), ["directory", "project_id"])
    assert.equal(db.sessions().length, 12)
    assert.deepEqual(db.sessions()[0], {
      table: "session",
      rowid: 1,
      directory: "C:/Users/Robin/Dev/repo/sub",
      projectId: "winrepo",
      path: "sub",
    })
    const repo = db.projects().find((project) => project.id === "winrepo")
    assert.equal(repo?.["time_created"], BIG_TIME, "timestamps are read without losing precision")
    assert.deepEqual(db.projectReferences(), [
      { table: "project_directory", column: "project_id" },
      { table: "worktree", column: "project_id" },
      { table: "permission", column: "project_id" },
    ])
    assert.equal(db.rowCounts()["note"], 2)
  } finally {
    db.close()
  }
})

test("BunMigrationStoreAdapter edits text cells in batches, and a collision keeps the later row", () => {
  const world = makeMigrationWorld(directory)
  const db = new BunMigrationStoreAdapter().open(world.windows)
  try {
    const written = db.editText("project_directory", "directory", (value) => value.replaceAll("\\", "/"))
    assert.equal(written, 1)
    assert.equal(db.rowCounts()["project_directory"], 1, "both spellings of the folder became one row")
    assert.equal(db.editText("event", "id", () => "never"), 0, "an integer column has no text cells")
    const many = new Database(world.live)
    many.exec("create table big(v text)")
    const insert = many.query("insert into big values (?)")
    many.transaction(() => {
      for (let index = 0; index < 4500; index++) insert.run(`v${index}`)
    })()
    many.close()
  } finally {
    db.close()
  }
  const live = new BunMigrationStoreAdapter().open(world.live)
  try {
    assert.equal(live.editText("big", "v", (value) => `${value}!`), 4500)
  } finally {
    live.close()
  }
  assert.equal(query<{ v: string }>(world.live, "select v from big where rowid = 4500")[0]?.v, "v4499!")
})

test("BunMigrationStoreAdapter merges absent rows only, by primary key or by whole row, and counts what is missing", () => {
  const world = makeMigrationWorld(directory)
  const base = join(directory, "base.db")
  const db = new Database(world.live)
  db.exec(`vacuum into '${base}'`)
  db.close()
  const extra = new Database(world.windows)
  extra.exec("create table only_windows(x text); alter table kv add column extra text")
  extra.close()

  const store = new BunMigrationStoreAdapter().open(base)
  try {
    assert.deepEqual(store.missingRows(world.windows, ["kv", "event", "note", "absent"]), { kv: 1, event: 0, note: 2 })
    const merged = Object.fromEntries(store.merge(world.windows).map((table) => [table.name, table]))
    assert.deepEqual(merged["kv"], { name: "kv", source_rows: 2, inserted: 1 })
    assert.deepEqual(merged["note"], { name: "note", source_rows: 2, inserted: 2 }, "keyless rows absent from the base all arrive")
    assert.equal(merged["event"]?.inserted, 0, "the base wins on a shared key")
    assert.equal(merged["only_windows"], undefined)
    assert.deepEqual(store.missingRows(world.windows, ["kv", "session_v2", "todo"]), { kv: 0, session_v2: 0, todo: 0 })
  } finally {
    store.close()
  }
  assert.deepEqual(query(base, "select value from kv order by key"), [{ value: "linux" }, { value: "C:/Users/Robin/x" }])
})

test("BunMigrationStoreAdapter writes projects and sessions, repoints references, and rolls a failed transaction back", () => {
  const world = makeMigrationWorld(directory)
  const db = new BunMigrationStoreAdapter().open(world.windows)
  try {
    const template = db.projects().find((project) => project.id === "winrepo")
    db.insertProject({ ...(template as Record<string, unknown>), id: "new", worktree: "/r" } as never)
    db.insertProject({ id: "new", worktree: "/ignored", time_created: 1, time_updated: 1, sandboxes: "[]" })
    db.updateProject("new", "/repo", "git")
    db.repoint({ table: "permission", column: "project_id" }, "winrepo", "new")
    db.repoint({ table: "permission", column: "project_id" }, "winmoved", "new")
    const session = db.sessions()[0]
    assert.ok(session !== undefined)
    db.updateSession(session, "new", "sub")
    db.deleteProject("wingone")
    assert.throws(() =>
      db.transaction(() => {
        db.deleteProject("winnotes")
        throw new Error("abort")
      }),
    )
    assert.equal(db.transaction(() => 7), 7)
  } finally {
    db.close()
  }
  const project = query<Record<string, unknown>>(world.windows, "select worktree, name from project where id = 'new'")[0]
  assert.equal(project?.["worktree"], "/repo")
  assert.equal(project?.["name"], "Repo")
  const created = query<{ t: string }>(world.windows, "select cast(time_created as text) as t from project where id = 'new'")
  assert.equal(created[0]?.t, BIG_TIME.toString())
  assert.deepEqual(query(world.windows, "select project_id, resource from permission"), [
    { project_id: "new", resource: "C:\\Users\\Robin\\Dev\\repo\\*" },
  ])
  assert.deepEqual(query(world.windows, "select project_id, path from session where id = 'ses_w1'"), [{ project_id: "new", path: "sub" }])
  assert.equal(query(world.windows, "select id from project where id in ('wingone', 'winnotes')").length, 1)
})

test("GitProjectIdentityAdapter derives OpenCode's ids: remote, stored id, root commit, plain folder", () => {
  const identity = new GitProjectIdentityAdapter()
  const plain = join(directory, "plain")
  mkdirSync(plain)
  assert.deepEqual(identity.resolve(plain), { id: sha1(`directory:${plain}`), worktree: plain, vcs: null, real: plain })
  assert.equal(identity.resolve(plain), identity.resolve(plain), "answers are cached")
  assert.equal(identity.resolve(join(directory, "none")), null)
  writeFileSync(join(directory, "file"), "")
  assert.equal(identity.resolve(join(directory, "file")), null)

  const remote = join(directory, "remote")
  makeRepository(remote, { remote: "git@GitHub.com:me/repo.git" })
  mkdirSync(join(remote, "sub"))
  assert.deepEqual(identity.resolve(join(remote, "sub")), {
    id: sha1("git-remote:github.com/me/repo"),
    worktree: remote,
    vcs: "git",
    real: join(remote, "sub"),
  })

  const upstream = join(directory, "upstream")
  makeRepository(upstream, { remote: "https://host/a/b", remoteName: "upstream" })
  assert.equal(identity.resolve(upstream)?.id, sha1("git-remote:host/a/b"))

  const stored = join(directory, "stored")
  makeRepository(stored, { remote: "/local/path", commit: true })
  writeFileSync(join(stored, ".git", "opencode"), "stored-id\n")
  assert.equal(identity.resolve(stored)?.id, "stored-id")

  const rooted = join(directory, "rooted")
  makeRepository(rooted, { commit: true })
  writeFileSync(join(rooted, ".git", "opencode"), "  \n")
  assert.match(identity.resolve(rooted)?.id ?? "", /^[0-9a-f]{40}$/)

  const empty = join(directory, "empty")
  makeRepository(empty)
  assert.deepEqual(identity.resolve(empty), { id: "global", worktree: "/", vcs: "git", real: empty })

  const hg = join(directory, "hg")
  mkdirSync(join(hg, ".hg"), { recursive: true })
  assert.equal(identity.resolve(hg), null)
})

test.skipIf(process.platform === "win32")("GitProjectIdentityAdapter falls back to the marker's folder when git cannot answer", () => {
  const repo = join(directory, "repo")
  makeRepository(repo, { remote: "https://host/r" })
  mkdirSync(join(repo, "sub"))
  // A git that knows the remote but fails every other question (as on a damaged worktree).
  const script = join(directory, "git-remote-only")
  writeFileSync(script, '#!/bin/sh\ncase "$3" in remote) [ "$4" = get-url ] && echo https://host/r || echo origin;; *) exit 1;; esac\n', { mode: 0o755 })
  assert.deepEqual(new GitProjectIdentityAdapter(script).resolve(join(repo, "sub")), {
    id: sha1("git-remote:host/r"),
    worktree: repo,
    vcs: "git",
    real: join(repo, "sub"),
  })
  assert.deepEqual(new GitProjectIdentityAdapter("false").resolve(repo), { id: "global", worktree: "/", vcs: "git", real: repo })
})

test("NodeMaintenanceFileSystemAdapter.removeDirectory removes an empty folder and refuses a full one", () => {
  const fileSystem = new NodeMaintenanceFileSystemAdapter()
  const empty = join(directory, "empty")
  const full = join(directory, "full")
  mkdirSync(empty)
  mkdirSync(full)
  writeFileSync(join(full, "x"), "")
  fileSystem.removeDirectory(empty)
  assert.equal(fileSystem.exists(empty), false)
  assert.throws(() => fileSystem.removeDirectory(full))
})
