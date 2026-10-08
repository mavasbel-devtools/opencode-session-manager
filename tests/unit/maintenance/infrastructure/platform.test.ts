import { test } from "bun:test"
import assert from "node:assert/strict"
import { chmodSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { Database } from "bun:sqlite"
import { UnsupportedPlatformError } from "@session-manager/domain/errors/UnsupportedPlatformError"
import { ProcFdHoldersAdapter } from "@session-manager/infrastructure/adapters/outbound/platform/linux/ProcFdHoldersAdapter"
import { ProcProcessListAdapter } from "@session-manager/infrastructure/adapters/outbound/platform/linux/ProcProcessListAdapter"
import { RenameProbeHoldersAdapter } from "@session-manager/infrastructure/adapters/outbound/platform/win32/RenameProbeHoldersAdapter"
import { TasklistAdapter, parseTasklist } from "@session-manager/infrastructure/adapters/outbound/platform/win32/TasklistAdapter"
import { platformAdapters, SUPPORTED_PLATFORMS } from "@session-manager/main/cli/platform"
import { FakeFileSystem } from "@test/support/maintenance/fakes/file-system"
import { removeTemporary, temporaryWorkspace } from "@test/support/maintenance/temporary"

const onLinux = process.platform === "linux"
const onWindows = process.platform === "win32"

/** A stand-in `/proc`: pid dirs with `comm` files and `fd` links, plus the shapes a real scan meets. */
function fakeProc(root: string, target: string): void {
  const pid = (id: string, comm: string | null, links: Record<string, string | null>) => {
    mkdirSync(join(root, id, "fd"), { recursive: true })
    if (comm !== null) writeFileSync(join(root, id, "comm"), `${comm}\n`)
    for (const [fd, to] of Object.entries(links)) {
      if (to === null) writeFileSync(join(root, id, "fd", fd), "not a link")
      else symlinkSync(to, join(root, id, "fd", fd))
    }
  }
  pid("100", "opencode", { "3": target, "4": "/dev/null" })
  pid("200", "opencode", { "5": `${target}-wal` })
  pid("300", null, { "6": `${target}-shm` })
  pid("400", "bash", { "0": "/dev/pts/1", "7": null })
  mkdirSync(join(root, "500"))
  mkdirSync(join(root, "self"))
}

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

test.skipIf(!onWindows)("TasklistAdapter finds the running node.exe through the real tasklist", async () => {
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

test("ProcProcessListAdapter matches comm exactly and skips what it cannot read", async () => {
  const directory = temporaryWorkspace("oc-db-proc-list-")
  try {
    fakeProc(directory, "/data/opencode.db")
    const adapter = new ProcProcessListAdapter(directory)
    assert.deepEqual(adapter.list("opencode"), [
      { image: "opencode", pid: 100 },
      { image: "opencode", pid: 200 },
    ])
    assert.deepEqual(adapter.list("opencode.exe"), [])
  } finally {
    removeTemporary(directory)
  }
})

test.skipIf(!onLinux)("ProcProcessListAdapter finds this test process in the real /proc", async () => {
  const comm = readFileSync("/proc/self/comm", "utf8").trim()
  assert.ok(new ProcProcessListAdapter("/proc").list(comm).some((entry) => entry.pid === process.pid))
})

test("ProcFdHoldersAdapter names every holder of the database or a sidecar, and nothing else", async () => {
  const directory = temporaryWorkspace("oc-db-proc-fd-")
  try {
    const data = join(directory, "data")
    mkdirSync(data)
    const target = join(data, "opencode.db")
    fakeProc(join(directory, "proc"), target)
    const adapter = new ProcFdHoldersAdapter(join(directory, "proc"))
    assert.equal(adapter.heldBy(target), "opencode 100, opencode 200, ? 300")
    assert.equal(adapter.heldBy(join(data, "other.db")), null)
    // A directory that does not exist cannot be made canonical; the path is used as given.
    assert.equal(adapter.heldBy(join(directory, "missing", "opencode.db")), null)
  } finally {
    removeTemporary(directory)
  }
})

test.skipIf(!onLinux)("ProcFdHoldersAdapter sees a real open connection, through a symlinked directory too", async () => {
  const directory = temporaryWorkspace("oc-db-proc-real-")
  try {
    const dbPath = join(directory, "opencode.db")
    symlinkSync(directory, join(directory, "link"))
    const adapter = new ProcFdHoldersAdapter("/proc")
    const self = `${readFileSync("/proc/self/comm", "utf8").trim()} ${process.pid}`
    const connection = new Database(dbPath)
    connection.exec("PRAGMA journal_mode = WAL; CREATE TABLE t (x); INSERT INTO t VALUES (1)")
    try {
      assert.equal(adapter.heldBy(dbPath), self)
      assert.equal(adapter.heldBy(join(directory, "link", "opencode.db")), self)
    } finally {
      connection.close()
    }
    assert.equal(adapter.heldBy(dbPath), null)
  } finally {
    removeTemporary(directory)
  }
})

test("platformAdapters wires each supported platform and refuses any other", async () => {
  const fileSystem = new FakeFileSystem()
  const linux = await platformAdapters("linux", fileSystem, 1)
  assert.ok(linux.processes instanceof ProcProcessListAdapter)
  assert.ok(linux.holders instanceof ProcFdHoldersAdapter)
  assert.equal(linux.image, "opencode")

  const windows = await platformAdapters("win32", fileSystem, 1)
  assert.ok(windows.processes instanceof TasklistAdapter)
  assert.ok(windows.holders instanceof RenameProbeHoldersAdapter)
  assert.equal(windows.image, "opencode.exe")

  assert.deepEqual(SUPPORTED_PLATFORMS, ["linux", "win32"])
  await assert.rejects(platformAdapters("toString", fileSystem, 1), UnsupportedPlatformError)
  await assert.rejects(platformAdapters("darwin", fileSystem, 1), (error: unknown) => {
    assert.ok(error instanceof UnsupportedPlatformError)
    assert.equal(error.message, "unsupported platform: darwin (supported: linux, win32)")
    return true
  })
})
