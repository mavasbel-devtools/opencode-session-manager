import { test } from "bun:test"
import assert from "node:assert/strict"
import { bootstrap } from "@session-manager/main/cli/cli"

test("bootstrap runs a command, and turns a thrown error into an ERROR line and exit code 1", async () => {
  const logged: string[] = []
  const errored: string[] = []
  const originalLog = console.log
  const originalError = console.error
  console.log = (value?: unknown) => {
    logged.push(String(value))
  }
  console.error = (value?: unknown) => {
    errored.push(String(value))
  }
  let usageCode: number
  let errorCode: number
  try {
    usageCode = await bootstrap(["bogus"], { OPENCODE_DB_COMPACT_IMAGE: "no-such.exe" })
    errorCode = await bootstrap(["rollback", "C:/definitely/missing-backup", "--db", "C:/nope/opencode.db"], {
      OPENCODE_DB_COMPACT_IMAGE: "no-such.exe",
    })
  } finally {
    console.log = originalLog
    console.error = originalError
  }
  assert.equal(usageCode, 2)
  assert.equal(errorCode, 1)
  assert.match(logged.join("\n"), /usage: opencode-session-manager/)
  assert.match(errored.join("\n"), /ERROR: no original database/)
})
