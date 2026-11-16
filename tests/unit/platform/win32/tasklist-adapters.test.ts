import { test } from "bun:test"
import assert from "node:assert/strict"
import { chmodSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { RenameProbeHoldersAdapter } from "@session-manager/infrastructure/adapters/outbound/platform/win32/RenameProbeHoldersAdapter"
import { TasklistAdapter, parseTasklist } from "@session-manager/infrastructure/adapters/outbound/platform/win32/TasklistAdapter"
import { FakeFileSystem } from "@test/support/maintenance/fakes/file-system"
import { currentPlatform, onlyOn } from "@test/support/platform"
import { removeTemporary, temporaryWorkspace } from "@test/support/maintenance/temporary"

const onWindows = currentPlatform() === "win32"

test("parseTasklist reads image/pid pairs and ignores INFO lines", async () => {
  assert.deepEqual(parseTasklist('"opencode.exe","42","Console","2","1 K"\r\nINFO: none\n"x.exe","7","S","0","1 K"'), [
    { image: "opencode.exe", pid: 42 },
    { image: "x.exe", pid: 7 },
  ])
})

test.skipIf(onWindows)("TasklistAdapter runs tasklist with an image filter and keeps exact (case-insensitive) matches", async () => {
  const directory = temporaryWorkspace("oc-db-tasklist-")
  try {
    // A real executable standing in for tasklist.exe, which only exists on Windows.
    const stub = join(directory, "tasklist")
    const argv = join(directory, "argv.json")
    writeFileSync(
      stub,
      `#!${process.execPath}\nrequire("node:fs").writeFileSync(${JSON.stringify(argv)}, JSON.stringify(process.argv.slice(2)))\n` +
        `process.stdout.write('"OpenCode.exe","42","Console","2","1 K"\\r\\nINFO: none\\n"other.exe","7","S","0","1 K"\\r\\n')\n`,
    )
    chmodSync(stub, 0o755)
    assert.deepEqual(new TasklistAdapter(stub).list("opencode.exe"), [{ image: "OpenCode.exe", pid: 42 }])
    assert.deepEqual(JSON.parse(readFileSync(argv, "utf8")), ["/fo", "csv", "/nh", "/fi", "imagename eq opencode.exe"])
  } finally {
    removeTemporary(directory)
  }
})

test.skipIf(onlyOn("win32"))("TasklistAdapter finds the running node.exe through the real tasklist (win32 only)", async () => {
  const adapter = new TasklistAdapter("tasklist")
  assert.deepEqual(adapter.list("no-such-image-opencode-db-manager.exe"), [])
  assert.ok(adapter.list("node.exe").some((entry) => entry.pid === process.pid))
})

test("RenameProbeHoldersAdapter renames away and back, and reports a refused rename by its code", async () => {
  const free = new FakeFileSystem()
  free.add("C:/x/opencode.db", "db")
  assert.equal(new RenameProbeHoldersAdapter(free, 4242).heldBy("C:/x/opencode.db"), null)
  assert.deepEqual(free.renames, [
    { from: "C:/x/opencode.db", to: "C:/x/opencode.db.lockprobe-4242" },
    { from: "C:/x/opencode.db.lockprobe-4242", to: "C:/x/opencode.db" },
  ])

  const held = new FakeFileSystem()
  held.add("C:/x/opencode.db", "db")
  held.failRenameFrom = "C:/x/opencode.db"
  assert.equal(new RenameProbeHoldersAdapter(held, 1).heldBy("C:/x/opencode.db"), "EBUSY")
  assert.equal(held.exists("C:/x/opencode.db"), true)

  const odd = { ...held, rename: () => { throw "locked" } } as unknown as FakeFileSystem
  assert.equal(new RenameProbeHoldersAdapter(odd, 1).heldBy("C:/x/opencode.db"), "locked")
})
