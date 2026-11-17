import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { FsFollowLockAdapter } from "@session-manager/infrastructure/adapters/outbound/fs/FsFollowLockAdapter"
import { ProcLivenessAdapter } from "@session-manager/infrastructure/adapters/outbound/platform/linux/ProcLivenessAdapter"
import { Sandbox, write } from "@test/support/patches/sandbox"

let box: Sandbox
beforeEach(() => {
  box = new Sandbox()
})
afterEach(() => box.dispose())

describe("ProcLivenessAdapter", () => {
  it("sees a pid alive while its /proc folder exists, and gone otherwise", async () => {
    const proc = path.join(box.home, "proc")
    mkdirSync(path.join(proc, String(process.pid)), { recursive: true })
    const liveness = new ProcLivenessAdapter(proc)
    expect([await liveness.isAlive(process.pid), await liveness.isAlive(2 ** 30)]).toEqual([true, false])
    expect([await liveness.isAlive(0), await liveness.isAlive(-1)]).toEqual([false, false])
  })
})

describe("FsFollowLockAdapter with a liveness stand-in", () => {
  it("stays held while the owner lives, and is taken over from a dead one", async () => {
    const file = path.join(box.state, "follow.lock")
    const proc = path.join(box.home, "proc")
    const own = path.join(proc, String(process.pid))
    mkdirSync(own, { recursive: true })
    const liveness = new ProcLivenessAdapter(proc)
    const lock = new FsFollowLockAdapter(file, liveness)
    const release = (await lock.acquire())!
    expect(readFileSync(file, "utf8")).toBe(String(process.pid))
    expect(await lock.acquire()).toBeNull()
    await release()
    expect(await lock.acquire()).not.toBeNull()
    writeFileSync(file, String(2 ** 30))
    expect(await lock.acquire()).not.toBeNull()
    writeFileSync(file, "not a pid")
    expect(await lock.acquire()).not.toBeNull()
  })
})
