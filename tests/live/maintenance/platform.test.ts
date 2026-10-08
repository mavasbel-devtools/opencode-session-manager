import { test } from "node:test"
import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { homedir } from "node:os"
import { defaultDatabasePath } from "#domain/model/Database.ts"
import { platformAdapters } from "#main/platform.ts"
import { NodeFileSystemAdapter } from "#infrastructure/adapters/outbound/NodeFileSystemAdapter.ts"

/**
 * Read-only: the platform adapters asked about the real OpenCode database and the real OpenCode
 * processes. Neither adapter opens the database, so this runs while OpenCode is using it.
 */
const liveDatabase = defaultDatabasePath({ XDG_DATA_HOME: process.env["XDG_DATA_HOME"] }, homedir())
const { processes, holders, image } = platformAdapters(process.platform, new NodeFileSystemAdapter(), process.pid)
const running = processes.list(image)
const skip =
  process.platform !== "linux"
    ? "the Windows probe renames the live file, which this read-only tier never does"
    : !existsSync(liveDatabase)
      ? `no OpenCode database at ${liveDatabase}`
      : running.length === 0
        ? `no ${image} process is running`
        : false

test("the running OpenCode is found holding the live database, by name and pid", { skip }, () => {
  const holder = holders.heldBy(liveDatabase)
  assert.notEqual(holder, null, `${liveDatabase} is reported as held while ${image} runs`)
  const named = (holder ?? "").split(", ")
  assert.ok(
    named.some((entry) => running.some((process_) => entry === `${image} ${process_.pid}`)),
    `holders ${holder} include a running ${image} (${running.map((entry) => entry.pid).join(", ")})`,
  )
})
