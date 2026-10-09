import { test } from "bun:test"
import assert from "node:assert/strict"
import type { Fingerprint } from "@session-manager/domain/model/Database"
import { buildContainer, rewriterFor } from "@session-manager/main/cli-container"
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

test("rewriterFor builds the path rewriter for a migration's mapping", () => {
  const rewriter = rewriterFor({ home: "/home/me", windowsUser: "Robin", drive: "C", mounts: [], relocations: [] })
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
      sessionStore: { sessions: () => [] },
      magicContextStore: { summary: () => ({ available: true, schemaVersion: 1, sessions: {} }), formatVersion: () => 1 },
    },
  )
  assert.equal(cli.run(["sessions", "--data", "/d"]), 0)
  assert.equal(output.lines[0], "opencode.db: /d/opencode/opencode.db (0 sessions)")
  assert.equal(output.lines[1], "context.db: /d/cortexkit/magic-context/context.db (no Magic Context store)")
})
