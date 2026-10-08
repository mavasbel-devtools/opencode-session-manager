import { test } from "bun:test"
import assert from "node:assert/strict"
import { bootstrap } from "@session-manager/main/cli/cli"
import { captureConsole, captureConsoleError } from "@test/support/maintenance/console"

test("bootstrap runs a command, and turns a thrown error into an ERROR line and exit code 1", async () => {
  const logged = captureConsole()
  const errored = captureConsoleError()
  let usageCode: number
  let errorCode: number
  try {
    usageCode = await bootstrap(["bogus"], { OPENCODE_DB_COMPACT_IMAGE: "no-such.exe" })
    errorCode = await bootstrap(["rollback", "C:/definitely/missing-backup", "--db", "C:/nope/opencode.db"], {
      OPENCODE_DB_COMPACT_IMAGE: "no-such.exe",
    })
  } finally {
    logged.restore()
    errored.restore()
  }
  assert.equal(usageCode, 2)
  assert.equal(errorCode, 1)
  assert.match(logged.lines.join("\n"), /usage: opencode-session-manager/)
  assert.match(errored.lines.join("\n"), /ERROR: no original database/)
})
