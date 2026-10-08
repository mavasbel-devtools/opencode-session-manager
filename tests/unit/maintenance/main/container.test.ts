import { test } from "node:test"
import assert from "node:assert/strict"
import type { Fingerprint } from "#domain/model/Database.ts"
import { buildContainer } from "#main/container.ts"
import { FakeFileSystem } from "#test/support/fakes/file-system.ts"
import { FakeOutput } from "#test/support/fakes/output.ts"
import { FakeProcessList } from "#test/support/fakes/processes.ts"
import { FakeReportSink } from "#test/support/fakes/report-sink.ts"
import { FakeRuntime } from "#test/support/fakes/runtime.ts"
import { FakeSqlite } from "#test/support/fakes/sqlite.ts"

const print: Fingerprint = { schema: [], header: { userVersion: 0, applicationId: 0 }, tables: {} }

test("buildContainer wires the real adapters when nothing is overridden", () => {
  const cli = buildContainer({ XDG_DATA_HOME: "C:/x" })
  assert.equal(typeof cli.run, "function")
  assert.equal(buildContainer({}, {}).run(["--help"]), 2)
})

test("overrides replace adapters and drive a full preflight end to end", () => {
  const output = new FakeOutput()
  const fileSystem = new FakeFileSystem()
  fileSystem.add("C:/x/opencode.db", "database-bytes")
  const cli = buildContainer(
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
