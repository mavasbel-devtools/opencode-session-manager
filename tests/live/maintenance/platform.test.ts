import { test } from "bun:test"
import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { homedir } from "node:os"
import { defaultDatabasePath } from "@session-manager/domain/model/Database"
import { platformAdapters } from "@session-manager/main/cli/platform"
import { NodeMaintenanceFileSystemAdapter } from "@session-manager/infrastructure/adapters/outbound/fs/NodeMaintenanceFileSystemAdapter"
import { currentPlatform, onlyOn, requires } from "@test/support/platform"

/**
 * Read-only: the platform adapters asked about the real OpenCode database and the real OpenCode
 * processes. Neither adapter opens the database, so this runs while OpenCode is using it.
 */
const liveDatabase = defaultDatabasePath({ XDG_DATA_HOME: process.env["XDG_DATA_HOME"] }, homedir())
const { processes, holders, image } = await platformAdapters(currentPlatform(), new NodeMaintenanceFileSystemAdapter(), process.pid)
const running = processes.list(image)
const LIVE_DATABASE = `an OpenCode database at ${liveDatabase}`
const RUNNING_PROCESS = `a running ${image} process`
const skip: string | false = onlyOn("linux")
  ? "runs only on linux: the Windows probe renames the live file, which this read-only tier never does"
  : requires(!existsSync(liveDatabase), LIVE_DATABASE)
    ? `requires ${LIVE_DATABASE}`
    : requires(running.length === 0, RUNNING_PROCESS)
      ? `requires ${RUNNING_PROCESS}`
      : false

test.skipIf(skip !== false)(`the running OpenCode is found holding the live database, by name and pid (linux only; requires ${LIVE_DATABASE}; requires ${RUNNING_PROCESS})`, async () => {
  const holder = holders.heldBy(liveDatabase)
  assert.notEqual(holder, null, `${liveDatabase} is reported as held while ${image} runs`)
  const named = (holder ?? "").split(", ")
  assert.ok(
    named.some((entry) => running.some((process_) => entry === `${image} ${process_.pid}`)),
    `holders ${holder} include a running ${image} (${running.map((entry) => entry.pid).join(", ")})`,
  )
})
