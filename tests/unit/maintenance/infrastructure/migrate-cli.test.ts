import { test } from "bun:test"
import assert from "node:assert/strict"
import type { MigrationVerification } from "@session-manager/domain/model/Migration"
import type { MigrateInput, MigrateOutcome, MigratePort } from "@session-manager/domain/ports/inbound/MigratePort"
import { CliRouter } from "@session-manager/infrastructure/adapters/inbound/cli/CliRouter"
import { MIGRATE_USAGE, MigrateCliAdapter, parseMigrateArguments } from "@session-manager/infrastructure/adapters/inbound/cli/MigrateCliAdapter"
import { FakeOutput } from "@test/support/maintenance/fakes/output"
import { FakeRuntime } from "@test/support/maintenance/fakes/runtime"

const PASSING: MigrationVerification = {
  ok: true,
  checks: {
    integrity_ok: true,
    foreign_keys_ok: true,
    rows_kept: true,
    windows_sessions_gone: true,
    structured_paths_clean: true,
    subpaths_consistent: true,
    json_intact: true,
  },
  missing_rows: {},
  windows_sessions: [],
  residual: {},
  subpath_mismatches: 0,
  row_counts: {},
}

const OUTCOME: MigrateOutcome = {
  ok: true,
  swapped: false,
  rewrites: [{ source: "/w.db", cells_rewritten: 5, by_column: {}, json_broken: 0 }],
  merges: [{ source: "/w.db", tables: [{ name: "a", source_rows: 3, inserted: 2 }, { name: "b", source_rows: 1, inserted: 1 }] }],
  rekey: {
    projects_remapped: 1,
    projects_created: 2,
    projects_dropped: 1,
    sessions_rekeyed: 4,
    subpaths_fixed: 0,
    missing_directories: [],
  },
  verification: PASSING,
  reportPath: "/r/report.json",
  migrated: null,
  backupDir: null,
  postIntegrityOk: false,
}

class ScriptedMigrate implements MigratePort {
  public readonly inputs: MigrateInput[] = []
  public outcome: MigrateOutcome = OUTCOME

  execute(input: MigrateInput): MigrateOutcome {
    this.inputs.push(input)
    return this.outcome
  }
}

function cli(migrate: MigratePort): { adapter: MigrateCliAdapter; output: FakeOutput } {
  const output = new FakeOutput()
  const runtime = new FakeRuntime()
  runtime.home = "/home/me/"
  const adapter = new MigrateCliAdapter({
    migrate,
    output,
    runtime,
    environment: { XDG_DATA_HOME: "/data" },
    image: "opencode",
    rehearsalDirectory: "/tmp/rehearsal",
  })
  return { adapter, output }
}

const BASE = ["--from", "/w.db", "--windows-user", "Robin"]

test("parseMigrateArguments reads repeated flags, the last single value, and reports bad input", () => {
  const args = parseMigrateArguments([
    "run",
    "--from",
    "/a.db",
    "--from",
    "/b.db",
    "--windows-user",
    "X",
    "--windows-user",
    "Robin",
    "--drive",
    "D",
    "--mount",
    "/m1",
    "--relocate",
    "/old/=/new/",
    "--home",
    "/h",
    "--db",
    "/d.db",
    "--keep",
  ])
  assert.deepEqual(args, {
    mode: "run",
    from: ["/a.db", "/b.db"],
    windowsUser: "Robin",
    drive: "D",
    mounts: ["/m1"],
    relocations: [{ from: "/old", to: "/new" }],
    home: "/h",
    db: "/d.db",
    keep: true,
    errors: [],
  })
  assert.equal(parseMigrateArguments([]).drive, "C")
  assert.deepEqual(parseMigrateArguments(["--from", "--keep", "--bogus", "--relocate", "nope", "--relocate", "=x", "--relocate", "a="]).errors, [
    "--from needs a value",
    "unknown option --bogus",
    "--relocate expects <from>=<to>, got nope",
    "--relocate expects <from>=<to>, got =x",
    "--relocate expects <from>=<to>, got a=",
  ])
  assert.deepEqual(parseMigrateArguments(["--db"]).errors, ["--db needs a value"])
})

test("MigrateCliAdapter prints usage and exits 2 without a mode, a source, a user, or with bad flags", () => {
  for (const argv of [[...BASE], ["plan", ...BASE], ["run", "--windows-user", "M"], ["run", "--from", "/w.db"], ["run", ...BASE, "--x"]]) {
    const migrate = new ScriptedMigrate()
    const { adapter, output } = cli(migrate)
    assert.equal(adapter.run(argv), 2)
    assert.equal(output.lines.at(-1), MIGRATE_USAGE)
    assert.equal(migrate.inputs.length, 0)
  }
})

test("MigrateCliAdapter rehearse builds the mapping and reports OK, with the kept copy when there is one", () => {
  const migrate = new ScriptedMigrate()
  const { adapter, output } = cli(migrate)
  assert.equal(adapter.run(["rehearse", ...BASE, "--mount", "/mnt/win"]), 0)
  assert.deepEqual(migrate.inputs[0], {
    dbPath: "/data/opencode/opencode.db",
    sources: ["/w.db"],
    mapping: { home: "/home/me", windowsUser: "Robin", drive: "C", mounts: ["/mnt/win"], relocations: [] },
    mode: "rehearse",
    directory: "/tmp/rehearsal",
    keep: false,
    image: "opencode",
  })
  assert.deepEqual(output.lines, [
    "database: /data/opencode/opencode.db",
    "source: /w.db",
    "rewrote 5 cells in /w.db",
    "merged 3 rows from /w.db",
    "rekeyed sessions=4 projects_remapped=1 created=2 dropped=1 subpaths_fixed=0",
    "PASS integrity_ok",
    "PASS foreign_keys_ok",
    "PASS rows_kept",
    "PASS windows_sessions_gone",
    "PASS structured_paths_clean",
    "PASS subpaths_consistent",
    "PASS json_intact",
    "REHEARSAL OK",
    "report: /r/report.json",
  ])

  migrate.outcome = { ...OUTCOME, migrated: "/tmp/rehearsal/m/opencode.db" }
  const kept = cli(migrate)
  assert.equal(kept.adapter.run(["rehearse", ...BASE, "--keep", "--home", "/h/"]), 0)
  assert.equal(migrate.inputs[1]?.mapping.home, "/h")
  assert.ok(kept.output.lines.includes("REHEARSAL OK migrated=/tmp/rehearsal/m/opencode.db"))
})

test("MigrateCliAdapter prints every failed gate's evidence and exits 1", () => {
  const migrate = new ScriptedMigrate()
  migrate.outcome = {
    ...OUTCOME,
    ok: false,
    rekey: { ...OUTCOME.rekey, missing_directories: ["/gone"] },
    verification: {
      ...PASSING,
      ok: false,
      checks: { ...PASSING.checks, rows_kept: false },
      missing_rows: { "/w.db": { part: 2 } },
      windows_sessions: ["C:/x"],
      residual: { "part.data": 3 },
      subpath_mismatches: 1,
    },
  }
  const { adapter, output } = cli(migrate)
  assert.equal(adapter.run(["rehearse", ...BASE]), 1)
  for (const line of [
    "session folders missing on this machine: 1 (see report; add --relocate)",
    "FAIL rows_kept",
    "  missing: part 2 rows from /w.db",
    "  windows session folder: C:/x",
    "  residual: part.data 3",
    "  subpath mismatches: 1",
    "REHEARSAL FAILED",
  ]) {
    assert.ok(output.lines.includes(line), line)
  }
})

test("MigrateCliAdapter run: the database's own folder, then SWAPPED with the undo command, or ABORTED", () => {
  const migrate = new ScriptedMigrate()
  migrate.outcome = { ...OUTCOME, swapped: true, backupDir: "/x/db-backup-1", postIntegrityOk: true }
  const swapped = cli(migrate)
  assert.equal(swapped.adapter.run(["run", ...BASE, "--db", "/x/opencode.db"]), 0)
  assert.equal(migrate.inputs[0]?.directory, "/x")
  assert.deepEqual(swapped.output.lines.slice(-3), [
    "SWAPPED backup=/x/db-backup-1 post_integrity_ok=true",
    "report: /r/report.json",
    "undo: opencode-session-manager rollback /x/db-backup-1 --db /x/opencode.db",
  ])

  migrate.outcome = { ...migrate.outcome, postIntegrityOk: false }
  assert.equal(cli(migrate).adapter.run(["run", ...BASE]), 1)

  migrate.outcome = { ...OUTCOME, ok: false, migrated: "/x/m/opencode.db" }
  const aborted = cli(migrate)
  assert.equal(aborted.adapter.run(["run", ...BASE]), 1)
  assert.deepEqual(aborted.output.lines.slice(-2), [
    "ABORTED: originals untouched; migrated copy kept at /x/m/opencode.db",
    "report: /r/report.json",
  ])
})

test("CliRouter sends a command family to its adapter without the family word, everything else to compact", () => {
  const seen: string[] = []
  const router = new CliRouter(
    { run: (argv) => (seen.push(`compact:${argv.join(" ")}`), 3) },
    {
      migrate: { run: (argv) => (seen.push(`migrate:${argv.join(" ")}`), 4) },
      sessions: { run: (argv) => (seen.push(`sessions:${argv.join(" ")}`), 5) },
    },
  )
  assert.equal(router.run(["migrate", "rehearse"]), 4)
  assert.equal(router.run(["sessions", "--json"]), 5)
  assert.equal(router.run(["preflight"]), 3)
  assert.equal(router.run(["toString"]), 3)
  assert.equal(router.run([]), 3)
  assert.deepEqual(seen, ["migrate:rehearse", "sessions:--json", "compact:preflight", "compact:toString", "compact:"])
})
