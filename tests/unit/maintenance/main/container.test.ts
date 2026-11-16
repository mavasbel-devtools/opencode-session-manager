import { test } from "bun:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import type { Fingerprint } from "@session-manager/domain/model/Database"
import { buildContainer, combinedRewriter, nameRewriterFor, rewriterFor } from "@session-manager/main/cli-container"
import { FakeFileSystem } from "@test/support/maintenance/fakes/file-system"
import { FakeOutput } from "@test/support/maintenance/fakes/output"
import { FakeProcessList } from "@test/support/maintenance/fakes/processes"
import { FakeReportSink } from "@test/support/maintenance/fakes/report-sink"
import { FakeRuntime } from "@test/support/maintenance/fakes/runtime"
import { FakeSqlite } from "@test/support/maintenance/fakes/sqlite"

const print: Fingerprint = { schema: [], header: { userVersion: 0, applicationId: 0 }, tables: {} }

test("buildContainer wires the real adapters when nothing is overridden", async () => {
  const cli = await buildContainer({ XDG_DATA_HOME: "C:/x" })
  assert.equal(typeof cli.run, "function")
  assert.equal((await buildContainer({}, {})).run(["--bogus"]), 2)
})

test("--help and --version are wired to the help adapter", async () => {
  const output = new FakeOutput()
  const cli = await buildContainer({}, { output })
  assert.equal(cli.run(["--version"]), 0)
  assert.equal(cli.run(["--help"]), 0)
  assert.match(output.lines[0] ?? "", /^opencode-session-manager \d+\.\d+\.\d+$/)
  assert.match(output.lines[1] ?? "", /^opencode-session-manager: browse/)
})

test("overrides replace adapters and drive a full preflight end to end", async () => {
  const output = new FakeOutput()
  const fileSystem = new FakeFileSystem()
  fileSystem.add("C:/x/opencode.db", "database-bytes")
  const cli = await buildContainer(
    { XDG_DATA_HOME: "C:/x", OPENCODE_DB_COMPACT_IMAGE: "no-such.exe", OPENCODE_DB_COMPACT_REHEARSAL_DIR: "C:/r" },
    {
      sqlite: new FakeSqlite({ fingerprint: print }),
      fileSystem,
      processes: new FakeProcessList(),
      runtime: new FakeRuntime(),
      reports: new FakeReportSink(),
      output,
    },
  )
  assert.equal(cli.run(["preflight", "--db", "C:/x/opencode.db"]), 0)
  assert.equal(output.lines[0], "database: C:/x/opencode.db")
  assert.match(output.lines[1] ?? "", /"opencode\.db": 14/)
})

test("nameRewriterFor and combinedRewriter build the renamed-name rewriter and its composition", () => {
  const names = nameRewriterFor([{ parent: "/home/me/ITAM", from: "2026-02-rel", to: "rel" }])
  assert.equal(names.rewrite("cd 2026-02-rel/x"), "cd rel/x")
  const both = combinedRewriter([{ rewrite: (text) => text.replace("a", "b"), residual: () => false }, names])
  assert.deepEqual([both.rewrite("a 2026-02-rel"), both.residual("2026-02-rel")], ["b rel", true])
})

test("rewriterFor builds the path rewriter for a migration's mapping", () => {
  const rewriter = rewriterFor({ home: "/home/me", windowsUser: "Robin", drive: "C", relocations: [] })
  assert.equal(rewriter.rewrite("C:\\Users\\Robin\\x"), "/home/me/x")
  assert.equal(rewriter.residual("Users/Robin"), true)
})

test("overrides replace the session and Magic Context stores behind `sessions`", async () => {
  const output = new FakeOutput()
  const fileSystem = new FakeFileSystem()
  fileSystem.add("/d/opencode/opencode.db")
  const cli = await buildContainer(
    {},
    {
      fileSystem,
      runtime: new FakeRuntime(),
      output,
      sessionStore: { sessions: () => [], messageIds: () => [] },
      magicContextStore: { summary: () => ({ available: true, schemaVersion: 1, sessions: {} }), formatVersion: () => 1 },
    },
  )
  assert.equal(cli.run(["sessions", "--data", "/d"]), 0)
  assert.equal(output.lines[0], "opencode.db: /d/opencode/opencode.db (0 sessions)")
  assert.equal(output.lines[1], "context.db: /d/cortexkit/magic-context/context.db (no Magic Context store)")
})

test("relocate --configured reads the plugin's location_repair mappings from the configured XDG_CONFIG_HOME", async () => {
  const config = fs.mkdtempSync(path.join(os.tmpdir(), "session-manager-container-config-"))
  try {
    fs.mkdirSync(path.join(config, "opencode"))
    fs.writeFileSync(
      path.join(config, "opencode", "session-manager.jsonc"),
      JSON.stringify({ location_repair: { maps: [{ from: "/a", to: "/b" }, { from: "/a/c", to: "/b/c" }] } }),
    )
    const cli = await buildContainer({ XDG_CONFIG_HOME: config }, { runtime: new FakeRuntime(), output: new FakeOutput() })
    assert.throws(() => cli.run(["relocate", "--configured", "--all"]), /location_repair maps must not overlap/)
  } finally {
    fs.rmSync(config, { recursive: true, force: true })
  }
})
