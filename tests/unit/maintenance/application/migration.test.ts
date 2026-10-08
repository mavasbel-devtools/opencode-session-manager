import { test } from "node:test"
import assert from "node:assert/strict"
import { DatabaseSizesService } from "#application/DatabaseSizesService.ts"
import { GuardService } from "#application/GuardService.ts"
import { MigrateUseCase } from "#application/MigrateUseCase.ts"
import { MigrationVerifier } from "#application/MigrationVerifier.ts"
import { RekeyService } from "#application/RekeyService.ts"
import { RewriteService } from "#application/RewriteService.ts"
import { SwapService } from "#application/SwapService.ts"
import { DatabaseNotFoundError } from "#domain/errors/DomainErrors.ts"
import type { PathMapping, RewriteReport } from "#domain/model/Migration.ts"
import type { MigrateInput } from "#domain/ports/inbound/MigratePort.ts"
import { PathRewriter, type TextRewriter } from "#domain/services/PathRewriter.ts"
import { RequiredSpacePolicy } from "#domain/services/RequiredSpacePolicy.ts"
import { FakeFileSystem } from "#test/support/fakes/file-system.ts"
import { FakeHolders } from "#test/support/fakes/holders.ts"
import { FakeIdentity, FakeMigrationDatabase, FakeMigrationStore } from "#test/support/fakes/migration-store.ts"
import { FakeProcessList } from "#test/support/fakes/processes.ts"
import { FakeReportSink } from "#test/support/fakes/report-sink.ts"
import { FakeRuntime } from "#test/support/fakes/runtime.ts"
import { FakeSqlite } from "#test/support/fakes/sqlite.ts"

const MAPPING: PathMapping = { home: "/home/me", windowsUser: "Robin", drive: "C", mounts: [], relocations: [] }
const rewriter = new PathRewriter(MAPPING)
const STAMP = "2026-09-27-00-00-00"

test("RewriteService rewrites every text column except the untouched tables, and counts broken JSON", () => {
  const db = new FakeMigrationDatabase({
    session_v2: [{ directory: "C:/Users/Robin/x", path: null, n: 3 }],
    part: [{ data: '{"cwd":"C:\\\\Users\\\\Robin"}' }, { data: "no path" }],
    credential: [{ secret: "C:/Users/Robin/.secret" }],
  })
  const report = new RewriteService().rewrite(db, rewriter, "/w/opencode.db")
  assert.deepEqual(report, {
    source: "/w/opencode.db",
    cells_rewritten: 2,
    by_column: { "session_v2.directory": 1, "part.data": 1 },
    json_broken: 0,
  })
  assert.equal(db.rows("part")[0]?.["data"], '{"cwd":"/home/me"}')
  assert.equal(db.rows("credential")[0]?.["secret"], "C:/Users/Robin/.secret")

  const breaking: TextRewriter = { rewrite: (text) => `${text}!`, residual: () => false }
  const broken = new RewriteService().rewrite(
    new FakeMigrationDatabase({ part: [{ data: '{"a":1}' }, { data: "[oops" }, { data: "plain" }] }),
    breaking,
    "s",
  )
  assert.equal(broken.json_broken, 1)
  assert.equal(broken.cells_rewritten, 3)
})

function rekeyWorld(): { db: FakeMigrationDatabase; identity: FakeIdentity } {
  const db = new FakeMigrationDatabase({
    project: [
      { id: "global", worktree: "/", vcs: null, name: null },
      { id: "oldrepo", worktree: "/home/me/repo", vcs: "git", name: "Repo", time_created: 5n },
      { id: "same", worktree: "/home/me/same", vcs: null, name: "Same" },
      { id: "oldgone", worktree: "/home/me/gone", vcs: null, name: "Gone" },
      { id: "oldmoved", worktree: "/home/me/moved", vcs: null, name: "Moved" },
      { id: "stale", worktree: "/home/me/stale-old", vcs: null, name: "Stale" },
      { id: "kept", worktree: "/home/me/kept", vcs: null, name: "Kept" },
    ],
    session_v2: [
      { id: "a", project_id: "oldrepo", directory: "/home/me/repo/sub", path: "wrong" },
      { id: "b", project_id: "global", directory: "/home/me/plain", path: "home/me/plain" },
      { id: "c", project_id: "oldgone", directory: "/home/me/gone/x", path: "x" },
      { id: "d", project_id: "oldmoved", directory: "/home/me/moved/deleted", path: "old" },
      { id: "e", project_id: "oldgone", directory: "/elsewhere", path: "keep" },
      { id: "f", project_id: "unknown", directory: "/nowhere", path: "p" },
      { id: "g", project_id: "global", directory: null, path: null },
      { id: "h", project_id: "same", directory: "/home/me/same", path: null },
      { id: "i", project_id: "same", directory: "/home/me/stale", path: null },
      { id: "j", project_id: "kept", directory: "/home/me/kept-session", path: null },
    ],
    session: [{ id: "v1", project_id: "oldrepo", directory: "/home/me/repo", path: null }],
    permission: [{ project_id: "oldrepo", resource: "*" }],
  })
  db.references = [{ table: "permission", column: "project_id" }]
  const identity = new FakeIdentity()
  identity.add("/home/me/repo", "newrepo", "/home/me/repo", "git")
  identity.add("/home/me/repo/sub", "newrepo", "/home/me/repo", "git", "/home/me/repo/sub")
  identity.add("/home/me/plain", "plainid", "/home/me/plain")
  identity.add("/home/me/same", "same", "/home/me/same")
  identity.add("/home/me/moved", "newmoved", "/home/me/moved")
  identity.add("/home/me/stale", "stale", "/home/me/stale")
  identity.add("/home/me/stale-old", "stalenew", "/home/me/stale-old")
  identity.add("/home/me/kept", "keptnew", "/home/me/kept")
  // A session folder that still resolves to the old id keeps that project alive.
  identity.add("/home/me/kept-session", "kept", "/home/me/kept-session")
  return { db, identity }
}

test("RekeyService gives each session the project derived here and drops the projects nothing uses", () => {
  const { db, identity } = rekeyWorld()
  const runtime = new FakeRuntime()
  const report = new RekeyService(identity, runtime).rekey(db)

  const sessions = Object.fromEntries(db.rows("session_v2").map((row) => [row["id"], [row["project_id"], row["path"]]]))
  assert.deepEqual(sessions["a"], ["newrepo", "sub"])
  assert.deepEqual(sessions["b"], ["plainid", null])
  assert.deepEqual(sessions["c"], ["oldgone", "x"], "missing folder, project not remapped, subpath already right")
  assert.deepEqual(sessions["d"], ["newmoved", "deleted"], "missing folder follows its remapped project")
  assert.deepEqual(sessions["e"], ["oldgone", "keep"], "outside its worktree: left as it was")
  assert.deepEqual(sessions["f"], ["unknown", "p"])
  assert.deepEqual(sessions["g"], ["global", null])
  assert.deepEqual(sessions["h"], ["same", null])
  assert.deepEqual(sessions["i"], ["stale", null])
  assert.deepEqual(sessions["j"], ["kept", null])
  assert.deepEqual(db.rows("session")[0], { id: "v1", project_id: "newrepo", directory: "/home/me/repo", path: null })

  const projects = Object.fromEntries(db.rows("project").map((row) => [row["id"], row]))
  assert.equal(projects["oldrepo"], undefined)
  assert.equal(projects["oldmoved"], undefined)
  assert.equal(projects["newrepo"]?.["name"], "Repo", "a re-keyed project is a copy of the one it replaces")
  assert.equal(projects["newrepo"]?.["time_created"], 5n)
  assert.equal(projects["plainid"]?.["sandboxes"], "[]", "a project created for the global one starts empty")
  assert.equal(projects["stale"]?.["worktree"], "/home/me/stale", "an existing project takes the worktree derived here")
  assert.ok(projects["kept"] !== undefined, "still used by session j")
  assert.equal(db.rows("permission")[0]?.["project_id"], "newrepo")
  assert.deepEqual(report, {
    projects_remapped: 4,
    projects_created: 5,
    projects_dropped: 2,
    sessions_rekeyed: 5,
    subpaths_fixed: 0,
    missing_directories: ["/elsewhere", "/home/me/gone/x", "/home/me/moved/deleted", "/nowhere"],
  })
})

test("RekeyService fixes the subpath of a session whose folder is missing but sits below its project", () => {
  const db = new FakeMigrationDatabase({
    project: [{ id: "p", worktree: "/home/me/p" }],
    session_v2: [{ id: "s", project_id: "p", directory: "/home/me/p/a/b", path: "stale" }],
  })
  const report = new RekeyService(new FakeIdentity(), new FakeRuntime()).rekey(db)
  assert.equal(db.rows("session_v2")[0]?.["path"], "a/b")
  assert.equal(report.subpaths_fixed, 1)
  assert.equal(report.sessions_rekeyed, 0)
})

function verifierDatabase(): FakeMigrationDatabase {
  const db = new FakeMigrationDatabase({
    project: [
      { id: "p", worktree: "/home/me/p" },
      { id: "global", worktree: "/" },
    ],
    project_directory: [{ project_id: "p", directory: "/home/me/p" }],
    session_v2: [
      { project_id: "p", directory: "/home/me/p/x", path: "x" },
      { project_id: "p", directory: "/home/me/p/link", path: "real" },
      { project_id: "global", directory: "/elsewhere", path: "elsewhere" },
      { project_id: "missing", directory: "/home/me/q", path: null },
      { project_id: "p", directory: null, path: null },
      { project_id: "p", directory: "/other", path: "zzz" },
    ],
    part: [{ data: "ok" }],
    credential: [{ secret: "C:/Users/Robin" }],
  })
  db.references = [{ table: "project_directory", column: "project_id" }]
  return db
}

test("MigrationVerifier passes a clean copy", () => {
  const db = verifierDatabase()
  const identity = new FakeIdentity()
  identity.add("/home/me/p/link", "p", "/home/me/p", null, "/home/me/p/real")
  const sqlite = new FakeSqlite()
  const result = new MigrationVerifier(sqlite, identity).verify({
    db,
    dbPath: "/m/opencode.db",
    inputs: ["/m/base.db"],
    rewrites: [{ source: "s", cells_rewritten: 0, by_column: {}, json_broken: 0 }],
    rewriter,
  })
  assert.equal(result.ok, true)
  assert.deepEqual(result.residual, {}, "credentials are not inspected")
  assert.equal(result.row_counts["session_v2"], 6)
  assert.ok(sqlite.calls.includes("integrity:/m/opencode.db"))
  assert.equal(db.closed, false, "the caller owns the connection")
})

test("MigrationVerifier fails on missing rows, Windows folders, residual paths, subpaths, broken JSON and integrity", () => {
  const db = verifierDatabase()
  db.rows("session_v2").push({ project_id: "p", directory: "C:/Users/Robin/x", path: null })
  db.rows("session_v2").push({ project_id: "p", directory: "/home/me/p/y", path: "wrong" })
  db.rows("project_directory").push({ project_id: "p", directory: "Users/Robin/z" })
  db.rows("part").push({ data: "Users\\\\Robin\\\\a" })
  db.missing = { "/m/source-1.db": { session_v2: 2, part: 0 } }
  const sqlite = new FakeSqlite({ integrity: { integrity_ok: false, integrity: ["bad"], foreign_key_violations: 1 } })
  const broken: RewriteReport = { source: "s", cells_rewritten: 1, by_column: {}, json_broken: 1 }
  const result = new MigrationVerifier(sqlite, new FakeIdentity()).verify({
    db,
    dbPath: "/m/opencode.db",
    inputs: ["/m/base.db", "/m/source-1.db"],
    rewrites: [broken],
    rewriter,
  })
  assert.equal(result.ok, false)
  assert.deepEqual(result.checks, {
    integrity_ok: false,
    foreign_keys_ok: false,
    rows_kept: false,
    windows_sessions_gone: false,
    structured_paths_clean: false,
    subpaths_consistent: false,
    json_intact: false,
  })
  assert.deepEqual(result.missing_rows, { "/m/source-1.db": { session_v2: 2 } })
  assert.deepEqual(result.windows_sessions, ["C:/Users/Robin/x"])
  assert.deepEqual(result.residual, { "project_directory.directory": 1, "session_v2.directory": 1, "part.data": 1 })
  assert.equal(result.subpath_mismatches, 2)
})

interface MigrateWorld {
  readonly fileSystem: FakeFileSystem
  readonly sqlite: FakeSqlite
  readonly store: FakeMigrationStore
  readonly reports: FakeReportSink
  readonly processes: FakeProcessList
  readonly useCase: MigrateUseCase
}

function migrateWorld(): MigrateWorld {
  const fileSystem = new FakeFileSystem()
  fileSystem.add("/x/opencode.db", "live")
  fileSystem.add("/x/opencode.db-wal", "wal")
  fileSystem.add("/w/opencode.db", "windows")
  const sqlite = new FakeSqlite({ onVacuum: (_source, target) => fileSystem.add(target, "copy") })
  const store = new FakeMigrationStore()
  const reports = new FakeReportSink()
  const processes = new FakeProcessList()
  const runtime = new FakeRuntime()
  const identity = new FakeIdentity()
  const useCase = new MigrateUseCase({
    guard: new GuardService(fileSystem, processes, new FakeHolders()),
    swapper: new SwapService(fileSystem),
    sizes: new DatabaseSizesService(fileSystem),
    space: new RequiredSpacePolicy(),
    rewriteService: new RewriteService(),
    rekeyService: new RekeyService(identity, runtime),
    verifier: new MigrationVerifier(sqlite, identity),
    store,
    sqlite,
    fileSystem,
    reports,
    runtime,
  })
  return { fileSystem, sqlite, store, reports, processes, useCase }
}

function input(mode: "rehearse" | "run", extra: Partial<MigrateInput> = {}): MigrateInput {
  return {
    dbPath: "/x/opencode.db",
    sources: ["/w/opencode.db"],
    mapping: MAPPING,
    mode,
    directory: mode === "run" ? "/x" : "/tmp/rehearsal",
    keep: false,
    image: "opencode",
    ...extra,
  }
}

test("MigrateUseCase rehearses on copies, merges the sources into the base, and deletes the result unless kept", () => {
  const w = migrateWorld()
  const work = `/tmp/rehearsal/opencode.db.migrate-${STAMP}`
  w.store.open(`${work}/base.db`).mergeResult = [{ name: "session_v2", source_rows: 3, inserted: 2 }]
  w.store.open(`${work}/source-1.db`).data.set("session_v2", [{ directory: "C:/Users/Robin/x" }])

  const dropped = w.useCase.execute(input("rehearse"))
  assert.equal(dropped.ok, true)
  assert.equal(dropped.swapped, false)
  assert.equal(dropped.migrated, null)
  assert.equal(dropped.reportPath, `${work}/report.json`)
  assert.deepEqual(dropped.merges, [{ source: "/w/opencode.db", tables: [{ name: "session_v2", source_rows: 3, inserted: 2 }] }])
  assert.equal(dropped.rewrites[1]?.cells_rewritten, 1)
  assert.deepEqual(w.store.databases.get(`${work}/base.db`)?.merged, [`${work}/source-1.db`])
  assert.ok(w.sqlite.calls.includes(`vacuumInto:/x/opencode.db->${work}/base.db`))
  assert.ok(w.sqlite.calls.includes(`vacuumInto:/w/opencode.db->${work}/source-1.db`))
  assert.ok(w.sqlite.calls.includes(`setWal:${work}/opencode.db`))
  for (const name of ["base.db", "source-1.db", "opencode.db"]) assert.equal(w.fileSystem.exists(`${work}/${name}`), false)
  assert.equal(w.fileSystem.exists("/x/opencode.db"), true)
  assert.equal(w.fileSystem.renames.length, 0)
  assert.ok([...w.store.databases.values()].every((db) => db.closed))
  const report = w.reports.written[0]?.report as { mode: string; swapped: boolean }
  assert.equal(report.mode, "migrate-rehearse")
  assert.equal(report.swapped, false)

  const kept = w.useCase.execute(input("rehearse", { keep: true }))
  assert.equal(kept.migrated, `${work}/opencode.db`)
  assert.equal(w.fileSystem.exists(`${work}/opencode.db`), true)
})

test("MigrateUseCase run swaps a verified copy in by renames and keeps the originals", () => {
  const w = migrateWorld()
  const outcome = w.useCase.execute(input("run"))
  assert.equal(outcome.swapped, true)
  assert.equal(outcome.backupDir, `/x/db-backup-${STAMP}`)
  assert.equal(outcome.reportPath, `/x/db-backup-${STAMP}/report.json`)
  assert.equal(outcome.postIntegrityOk, true)
  assert.equal(w.fileSystem.exists(`/x/db-backup-${STAMP}/opencode.db`), true)
  assert.equal(w.fileSystem.exists(`/x/db-backup-${STAMP}/opencode.db-wal`), true)
  assert.equal(w.fileSystem.exists("/x/opencode.db"), true)
  assert.equal(w.fileSystem.exists(`/x/opencode.db.migrate-${STAMP}`), false, "the empty work folder is removed")
  const report = w.reports.written[0]?.report as { mode: string; swapped: boolean; moved: string[] }
  assert.equal(report.mode, "migrate-run")
  assert.deepEqual(report.moved, ["opencode.db", "opencode.db-wal"])
})

test("MigrateUseCase run aborts before the swap when a gate fails, keeping the migrated copy", () => {
  const w = migrateWorld()
  const work = `/x/opencode.db.migrate-${STAMP}`
  w.store.open(`${work}/opencode.db`).data.set("session_v2", [{ project_id: "global", directory: "D:/Work", path: null }])
  const outcome = w.useCase.execute(input("run"))
  assert.equal(outcome.ok, false)
  assert.equal(outcome.swapped, false)
  assert.equal(outcome.migrated, `${work}/opencode.db`)
  assert.equal(outcome.backupDir, null)
  assert.equal(outcome.verification.checks.windows_sessions_gone, false)
  assert.equal(w.fileSystem.renames.length, 0)
  assert.equal(w.fileSystem.exists(`${work}/opencode.db`), true)
})

test("MigrateUseCase refuses a missing input and a running OpenCode before copying anything", () => {
  const w = migrateWorld()
  assert.throws(() => w.useCase.execute(input("rehearse", { sources: ["/w/none.db"] })), DatabaseNotFoundError)
  w.processes.running = [{ image: "opencode", pid: 7 }]
  assert.throws(() => w.useCase.execute(input("run")), /running/i)
  assert.doesNotThrow(() => w.useCase.execute(input("rehearse")), "a rehearsal never touches the live files")
  assert.equal(w.sqlite.calls.filter((call) => call.startsWith("vacuumInto:/x/opencode.db->/x/")).length, 0)
})
