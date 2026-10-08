import { test } from "bun:test"
import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { homedir } from "node:os"
import { defaultDatabasePath } from "@session-manager/domain/model/Database"
import { platformAdapters } from "@session-manager/main/cli/platform"
import { NodeMaintenanceFileSystemAdapter } from "@session-manager/infrastructure/adapters/outbound/fs/NodeMaintenanceFileSystemAdapter"

/**
 * Read-only: the platform adapters asked about the real OpenCode database and the real OpenCode
 * processes. Neither adapter opens the database, so this runs while OpenCode is using it.
 */
const liveDatabase = defaultDatabasePath({ XDG_DATA_HOME: process.env["XDG_DATA_HOME"] }, homedir())
const { processes, holders, image } = await platformAdapters(process.platform, new NodeMaintenanceFileSystemAdapter(), process.pid)
const running = processes.list(image)
const skip =
  process.platform !== "linux"
    ? "the Windows probe renames the live file, which this read-only tier never does"
    : !existsSync(liveDatabase)
      ? `no OpenCode database at ${liveDatabase}`
      : running.length === 0
        ? `no ${image} process is running`
        : false

test.skipIf(skip !== false)("the running OpenCode is found holding the live database, by name and pid", async () => {
  const holder = holders.heldBy(liveDatabase)
  assert.notEqual(holder, null, `${liveDatabase} is reported as held while ${image} runs`)
  const named = (holder ?? "").split(", ")
  assert.ok(
    named.some((entry) => running.some((process_) => entry === `${image} ${process_.pid}`)),
    `holders ${holder} include a running ${image} (${running.map((entry) => entry.pid).join(", ")})`,
  )
})
