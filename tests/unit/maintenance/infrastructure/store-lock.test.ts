import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { chmodSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { BusySessionsError } from "@session-manager/domain/errors/BusySessionsError"
import { StoreLockedError } from "@session-manager/domain/errors/StoreLockedError"
import { lockFileOf } from "@session-manager/domain/model/StoreLock"
import { FsStoreLockAdapter } from "@session-manager/infrastructure/adapters/outbound/fs/FsStoreLockAdapter"
import { removeTemporary, temporaryWorkspace } from "@test/support/maintenance/temporary"

let directory = ""
beforeEach(() => {
  directory = temporaryWorkspace("oc-store-lock-")
})
afterEach(() => {
  chmodSync(directory, 0o755)
  removeTemporary(directory)
})

const locks = new FsStoreLockAdapter()
const me = { pid: process.pid, command: "sync", since: "2026-10-11T00:00:00.000Z" }
const store = (name: string) => join(directory, name)
/** A pid no process has: above the kernel's pid_max (4194304 at most on Linux). */
const GONE = 4_194_305

describe("FsStoreLockAdapter", () => {
  it("creates a private lock file per store naming its owner, and removes it on release", () => {
    const handle = locks.acquire([store("b.db"), store("a.db"), store("a.db")], me)
    for (const name of ["a.db", "b.db"]) {
      expect(JSON.parse(readFileSync(lockFileOf(store(name)), "utf8"))).toEqual(me)
      expect(statSync(lockFileOf(store(name))).mode & 0o777).toBe(0o600)
    }
    expect(handle.cleared).toEqual([])
    handle.release()
    handle.release()
    expect([existsSync(lockFileOf(store("a.db"))), existsSync(lockFileOf(store("b.db")))]).toEqual([false, false])
  })

  it("refuses a store a live process holds, releasing the locks it had already taken", () => {
    writeFileSync(lockFileOf(store("b.db")), JSON.stringify({ pid: process.ppid, command: "rollback", since: "t" }))
    expect(() => locks.acquire([store("a.db"), store("b.db")], me)).toThrow(
      new StoreLockedError(store("b.db"), lockFileOf(store("b.db")), { pid: process.ppid, command: "rollback", since: "t" }),
    )
    expect(existsSync(lockFileOf(store("a.db")))).toBe(false)
    expect(JSON.parse(readFileSync(lockFileOf(store("b.db")), "utf8")).pid).toBe(process.ppid)
  })

  it("treats a process it may not signal (another user's, such as pid 1) as alive", () => {
    writeFileSync(lockFileOf(store("a.db")), JSON.stringify({ pid: 1, command: "run", since: "t" }))
    expect(() => locks.acquire([store("a.db")], me)).toThrow(StoreLockedError)
  })

  it("never removes an unreadable or damaged lock", () => {
    writeFileSync(lockFileOf(store("a.db")), "{ half written")
    expect(() => locks.acquire([store("a.db")], me)).toThrow(/an unreadable lock/)
    writeFileSync(lockFileOf(store("a.db")), JSON.stringify({ pid: "x" }))
    expect(() => locks.acquire([store("a.db")], me)).toThrow(/an unreadable lock/)
    expect(readFileSync(lockFileOf(store("a.db")), "utf8")).toBe('{"pid":"x"}')
  })

  it("removes and reports a lock left by a process that no longer exists", () => {
    const stale = { pid: GONE, command: "context sync", since: "t" }
    writeFileSync(lockFileOf(store("a.db")), JSON.stringify(stale))
    const handle = locks.acquire([store("a.db")], me)
    expect(handle.cleared).toEqual([{ file: lockFileOf(store("a.db")), ...stale }])
    expect(JSON.parse(readFileSync(lockFileOf(store("a.db")), "utf8"))).toEqual(me)
    handle.release()
  })

  it("leaves a lock another process took over alone on release", () => {
    const handle = locks.acquire([store("a.db")], me)
    writeFileSync(lockFileOf(store("a.db")), JSON.stringify({ ...me, since: "later" }))
    handle.release()
    expect(existsSync(lockFileOf(store("a.db")))).toBe(true)
  })

  it("refuses when another process takes a cleared lock first, and reports file-system errors", () => {
    const stale = JSON.stringify({ pid: GONE, command: "sync", since: "t" })
    writeFileSync(lockFileOf(store("a.db")), stale)
    // Another process recreates the lock between the removal and this one's create: modelled by a
    // lock adapter whose second create finds the file again.
    const racing = new FsStoreLockAdapter()
    const create = (racing as unknown as { create: (file: string, owner: object) => boolean }).create.bind(racing)
    let calls = 0
    ;(racing as unknown as { create: (file: string, owner: object) => boolean }).create = (file, owner) => {
      calls++
      if (calls === 2) writeFileSync(file, JSON.stringify({ pid: process.ppid, command: "sync", since: "u" }))
      return create(file, owner)
    }
    expect(() => racing.acquire([store("a.db")], me)).toThrow(/pid \d+, sync, since u/)

    mkdirSync(join(directory, "ro"))
    chmodSync(join(directory, "ro"), 0o555)
    expect(() => locks.acquire([join(directory, "ro", "a.db")], me)).toThrow(/EACCES/)
    mkdirSync(lockFileOf(store("dir.db")))
    expect(() => locks.acquire([store("dir.db")], me)).toThrow(/an unreadable lock/)
  })
})

describe("lock and busy refusals", () => {
  it("say who holds the store and what to do", () => {
    expect(new StoreLockedError("/s.db", "/s.db.session-manager.lock", { pid: 4, command: "sync", since: "t" }).message).toBe(
      "/s.db is being written by another opencode-session-manager (pid 4, sync, since t); wait for it to finish, or remove /s.db.session-manager.lock if no such process runs",
    )
    expect(new BusySessionsError(["ses_a"]).message).toEndWith("or sync without --strict to skip it")
    expect(new BusySessionsError(["ses_a", "ses_b"]).message).toStartWith("--strict: Magic Context is working on ses_a, ses_b")
    expect(new BusySessionsError(["ses_a", "ses_b"]).message).toEndWith("skip them")
  })
})
