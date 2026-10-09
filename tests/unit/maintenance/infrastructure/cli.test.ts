import { test } from "bun:test"
import assert from "node:assert/strict"
import type { BuildAndVerifyResult } from "@session-manager/domain/model/Build"
import type { CompactPort } from "@session-manager/domain/ports/inbound/CompactPort"
import type { PreflightPort } from "@session-manager/domain/ports/inbound/PreflightPort"
import type { RehearsePort } from "@session-manager/domain/ports/inbound/RehearsePort"
import type { RollbackPort } from "@session-manager/domain/ports/inbound/RollbackPort"
import { CompactCliAdapter, USAGE, parseArguments } from "@session-manager/infrastructure/adapters/inbound/cli/CompactCliAdapter"
import { FakeOutput } from "@test/support/maintenance/fakes/output"
import { FakeRuntime } from "@test/support/maintenance/fakes/runtime"

function buildResult(overrides: Partial<BuildAndVerifyResult> = {}): BuildAndVerifyResult {
  return {
    ok: true,
    checks: {
      integrity_ok: true,
      foreign_keys_ok: true,
      freelist_zero: true,
      parity_ok: true,
      journal_wal: true,
      no_target_sidecars: true,
    },
    vacuum_ms: 10,
    total_ms: 20,
    target_bytes: 100,
    target_pages: { page_size: 4096, page_count: 1, freelist_count: 0, logical_bytes: 4096, free_bytes: 0, auto_vacuum: 0 },
    integrity: { integrity_ok: true, integrity: ["ok"], foreign_key_violations: 0 },
    comparison: { ok: true, failures: [], tables: [{ name: "t", source_rows: 1, target_rows: 1, match: true }] },
    ...overrides,
  }
}

interface Stubs {
  readonly preflight?: PreflightPort
  readonly rehearse?: RehearsePort
  readonly compact?: CompactPort
  readonly rollback?: RollbackPort
}

function run(argv: readonly string[], stubs: Stubs = {}): { code: number; output: FakeOutput } {
  const output = new FakeOutput()
  const cli = new CompactCliAdapter({
    preflight:
      stubs.preflight ??
      {
        execute: () => ({
          files: { "opencode.db": 10, "opencode.db-wal": null, "opencode.db-shm": null },
          pages: { page_size: 4096, page_count: 2, freelist_count: 1, logical_bytes: 8192, free_bytes: 4096, auto_vacuum: 0 },
          free_disk_bytes: 500,
          running: [],
        }),
      },
    rehearse: stubs.rehearse ?? { execute: () => ({ build: buildResult(), reportPath: "C:/r/report.json" }) },
    compact:
      stubs.compact ??
      {
        execute: () => ({
          swapped: true,
          build: buildResult(),
          reportPath: "C:/b/report.json",
          failedTarget: null,
          backupDir: "C:/b",
          beforeBytes: 10,
          afterBytes: 5,
          postIntegrityOk: true,
        }),
      },
    rollback: stubs.rollback ?? {
      execute: () => ({ restored: ["opencode.db"], parked: "C:/b/rolled-back-x" }),
      executeAll: (input) => input.dbPaths.map((dbPath) => ({ restored: [dbPath.split("/").at(-1)!], parked: "C:/b/rolled-back-x" })),
    },
    output,
    runtime: new FakeRuntime(),
    environment: { XDG_DATA_HOME: "C:/data" },
    image: "no-such.exe",
    rehearsalDirectory: "C:/r",
  })
  return { code: cli.run(argv), output }
}

test("parseArguments reads the mode, --db, --keep and positionals", () => {
  assert.deepEqual(parseArguments([]), { mode: undefined, positional: [], db: undefined, dbs: [], keep: false })
  assert.deepEqual(parseArguments(["run", "--db", "C:/x.db", "extra", "--keep"]), {
    mode: "run",
    positional: ["extra"],
    db: "C:/x.db",
    dbs: ["C:/x.db"],
    keep: true,
  })
  assert.deepEqual(parseArguments(["rollback", "C:/backup", "--db", "C:/a.db", "--db", "C:/c.db"]), {
    mode: "rollback",
    positional: ["C:/backup"],
    db: "C:/c.db",
    dbs: ["C:/a.db", "C:/c.db"],
    keep: false,
  })
  assert.deepEqual(parseArguments(["preflight", "--db"]), {
    mode: "preflight",
    positional: [],
    db: undefined,
    dbs: [],
    keep: false,
  })
})

test("preflight prints the database then the JSON report", () => {
  const { code, output } = run(["preflight"])
  assert.equal(code, 0)
  assert.equal(output.lines[0], "database: C:/data/opencode/opencode.db")
  assert.match(output.lines[1] ?? "", /"free_disk_bytes": 500/)
  assert.equal(JSON.parse(output.lines[1] ?? "").files["opencode.db"], 10)
})

test("--db overrides the default path", () => {
  const { output } = run(["preflight", "--db", "C:/x.db"])
  assert.equal(output.lines[0], "database: C:/x.db")
})

test("rehearse prints the checks and the verdict", () => {
  const ok = run(["rehearse", "--keep"])
  assert.equal(ok.code, 0)
  assert.deepEqual(ok.output.lines.slice(0, 3), [
    "database: C:/data/opencode/opencode.db",
    "PASS integrity_ok",
    "PASS foreign_keys_ok",
  ])
  assert.equal(ok.output.lines[6], "PASS no_target_sidecars")
  assert.equal(ok.output.lines[7], `REHEARSAL OK vacuum_ms=10 total_ms=20 target_bytes=100`)
  assert.equal(ok.output.lines[8], "report: C:/r/report.json")

  const failed = run(["rehearse"], {
    rehearse: {
      execute: () => ({
        build: buildResult({
          ok: false,
          checks: { integrity_ok: true, foreign_keys_ok: true, freelist_zero: true, parity_ok: false, journal_wal: true, no_target_sidecars: true },
          comparison: { ok: false, failures: ["table t differs"], tables: [{ name: "t", source_rows: 2, target_rows: 1, match: false }] },
        }),
        reportPath: "C:/r/report.json",
      }),
    },
  })
  assert.equal(failed.code, 1)
  assert.ok(failed.output.lines.includes("FAIL parity_ok"))
  assert.ok(failed.output.lines.includes("  differs: t source_rows=2 target_rows=1"))
  assert.ok(failed.output.lines.includes("REHEARSAL FAILED vacuum_ms=10 total_ms=20 target_bytes=100"))
})

test("run prints SWAPPED and returns 0 only when the post-swap integrity check passed", () => {
  const ok = run(["run"])
  assert.equal(ok.code, 0)
  assert.equal(ok.output.lines[7], "SWAPPED backup=C:/b before_bytes=10 after_bytes=5 post_integrity_ok=true")

  const broken = run(["run"], {
    compact: {
      execute: () => ({
        swapped: true,
        build: buildResult(),
        reportPath: "C:/b/report.json",
        failedTarget: null,
        backupDir: "C:/b",
        beforeBytes: 10,
        afterBytes: 5,
        postIntegrityOk: false,
      }),
    },
  })
  assert.equal(broken.code, 1)
  assert.ok(broken.output.lines.includes("SWAPPED backup=C:/b before_bytes=10 after_bytes=5 post_integrity_ok=false"))
})

test("run reports ABORTED with the kept failed copy", () => {
  const aborted = run(["run"], {
    compact: {
      execute: () => ({
        swapped: false,
        build: buildResult({
          ok: false,
          checks: { integrity_ok: true, foreign_keys_ok: true, freelist_zero: true, parity_ok: false, journal_wal: true, no_target_sidecars: true },
          comparison: { ok: false, failures: ["table t differs"], tables: [{ name: "t", source_rows: 2, target_rows: 1, match: false }] },
        }),
        reportPath: "C:/x.compact-1.report.json",
        failedTarget: "C:/x.compact-1",
        backupDir: null,
        beforeBytes: 10,
        afterBytes: null,
        postIntegrityOk: false,
      }),
    },
  })
  assert.equal(aborted.code, 1)
  assert.ok(aborted.output.lines.includes("  differs: t source_rows=2 target_rows=1"))
  assert.ok(aborted.output.lines.includes("ABORTED: originals untouched; failed copy kept at C:/x.compact-1"))
})

test("rollback prints the restored files, and needs a backup directory", () => {
  const rolled = run(["rollback", "C:/backup"])
  assert.equal(rolled.code, 0)
  assert.equal(rolled.output.lines[1], "ROLLED BACK restored=opencode.db parked=C:/b/rolled-back-x")
  assert.equal(run(["rollback"]).code, 2)
  assert.equal(run(["rollback"]).output.lines[1], USAGE)
  const both = run(["rollback", "C:/backup", "--db", "C:/o/opencode.db", "--db", "C:/c/context.db"])
  assert.deepEqual(both.output.lines.slice(1), [
    "ROLLED BACK restored=opencode.db parked=C:/b/rolled-back-x",
    "ROLLED BACK restored=context.db parked=C:/b/rolled-back-x",
  ])
})

test("an unknown mode prints the usage and returns 2", () => {
  const { code, output } = run(["bogus"])
  assert.equal(code, 2)
  assert.equal(output.lines[0], "database: C:/data/opencode/opencode.db")
  assert.equal(output.lines[1], USAGE)
})
