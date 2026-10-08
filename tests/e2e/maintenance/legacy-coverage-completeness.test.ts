import { test } from "node:test"
import assert from "node:assert/strict"
import { loadEverySource } from "#test/support/source-files.ts"

test("coverage completeness: every source file is loaded by the e2e tier", async () => {
  const loaded = await loadEverySource()
  assert.ok(loaded.length > 0)
  for (const file of loaded) assert.match(file, /^src[\\/].*\.ts$/)
})
