import { test } from "bun:test"
import assert from "node:assert/strict"
import { DatabaseHeldError } from "@session-manager/domain/errors/DatabaseHeldError"
import { DatabaseNotFoundError } from "@session-manager/domain/errors/DatabaseNotFoundError"
import { InsufficientSpaceError } from "@session-manager/domain/errors/InsufficientSpaceError"
import { MissingOriginalError } from "@session-manager/domain/errors/MissingOriginalError"
import { ProcessRunningError } from "@session-manager/domain/errors/ProcessRunningError"
import { SwapFailedError } from "@session-manager/domain/errors/SwapFailedError"
import { TargetExistsError } from "@session-manager/domain/errors/TargetExistsError"

test("every error carries its exact operator-facing message and name", () => {
  const held = new DatabaseHeldError("C:/db/opencode.db", "EBUSY")
  assert.equal(held.name, "DatabaseHeldError")
  assert.equal(held.message, "C:/db/opencode.db is held open by another process (EBUSY); close every OpenCode process first")

  const running = new ProcessRunningError("opencode.exe", [5, 6], 'close it and run "opencode service stop"')
  assert.equal(running.name, "ProcessRunningError")
  assert.equal(running.message, 'opencode.exe is running (PIDs 5, 6); close it and run "opencode service stop"')

  const rollbackRunning = new ProcessRunningError("opencode.exe", [9], "close it first")
  assert.equal(rollbackRunning.message, "opencode.exe is running (PIDs 9); close it first")

  const missing = new DatabaseNotFoundError("C:/db/opencode.db")
  assert.equal(missing.name, "DatabaseNotFoundError")
  assert.equal(missing.message, "database not found: C:/db/opencode.db")

  const space = new InsufficientSpaceError(1000, 1001)
  assert.equal(space.name, "InsufficientSpaceError")
  assert.equal(space.message, "not enough free disk space: 1000 B free, 1001 B required")

  const exists = new TargetExistsError("C:/db/compact.db")
  assert.equal(exists.name, "TargetExistsError")
  assert.equal(exists.message, "refusing to overwrite existing C:/db/compact.db")

  const original = new MissingOriginalError("C:/db/backup")
  assert.equal(original.name, "MissingOriginalError")
  assert.equal(original.message, "no original database in C:/db/backup")

  const swap = new SwapFailedError("disk says no")
  assert.equal(swap.name, "SwapFailedError")
  assert.equal(swap.message, "swap failed and the original files were restored: disk says no")
})
