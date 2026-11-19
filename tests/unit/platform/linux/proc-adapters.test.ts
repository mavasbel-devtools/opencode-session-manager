import { test } from "bun:test"
import assert from "node:assert/strict"
import { mkdirSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { Database } from "bun:sqlite"
import { ProcFdHoldersAdapter } from "@session-manager/infrastructure/adapters/outbound/platform/linux/ProcFdHoldersAdapter"
import { ProcProcessListAdapter } from "@session-manager/infrastructure/adapters/outbound/platform/linux/ProcProcessListAdapter"
import { onlyOn } from "@test/support/platform"
import { removeTemporary, temporaryWorkspace } from "@test/support/maintenance/temporary"

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

test("ProcProcessListAdapter matches comm exactly and skips what it cannot read", async () => {
  const directory = temporaryWorkspace("oc-db-proc-list-")
  try {
    fakeProc(directory, "/data/opencode.db")
    const adapter = new ProcProcessListAdapter(directory)
    assert.deepEqual([...adapter.list("opencode")].sort((a, b) => a.pid - b.pid), [
      { image: "opencode", pid: 100 },
      { image: "opencode", pid: 200 },
    ])
    assert.deepEqual(adapter.list("opencode.exe"), [])
  } finally {
    removeTemporary(directory)
  }
})

test.skipIf(onlyOn("linux"))("ProcProcessListAdapter finds this test process in the real /proc (linux only)", async () => {
  const comm = readFileSync("/proc/self/comm", "utf8").trim()
  assert.ok(new ProcProcessListAdapter("/proc").list(comm).some((entry) => entry.pid === process.pid))
})

test("ProcFdHoldersAdapter names every holder of the database or a sidecar, and nothing else", async () => {
  const directory = temporaryWorkspace("oc-db-proc-fd-")
  try {
    const data = join(directory, "data")
    mkdirSync(data)
    // The adapter resolves the database's directory before comparing it with the link targets,
    // so the links point at the resolved path too (`/var` vs `/private/var` on macOS).
    const target = join(realpathSync(data), "opencode.db")
    fakeProc(join(directory, "proc"), target)
    const adapter = new ProcFdHoldersAdapter(join(directory, "proc"))
    // `readdirSync` order is filesystem-dependent, so the holders are compared as a set.
    assert.deepEqual(adapter.heldBy(target)?.split(", ").sort(), ["? 300", "opencode 100", "opencode 200"])
    assert.equal(adapter.heldBy(join(data, "other.db")), null)
    // A directory that does not exist cannot be made canonical; the path is used as given.
    assert.equal(adapter.heldBy(join(directory, "missing", "opencode.db")), null)
  } finally {
    removeTemporary(directory)
  }
})

test.skipIf(onlyOn("linux"))("ProcFdHoldersAdapter sees a real open connection, through a symlinked directory too (linux only)", async () => {
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
