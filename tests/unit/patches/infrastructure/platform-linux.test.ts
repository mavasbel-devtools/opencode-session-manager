import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { mkdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { clockTicks } from "@session-manager/infrastructure/adapters/outbound/platform/linux/ClockTicks"
import { NotifySendAdapter } from "@session-manager/infrastructure/adapters/outbound/platform/linux/NotifySendAdapter"
import { ProcServiceAdapter } from "@session-manager/infrastructure/adapters/outbound/platform/linux/ProcServiceAdapter"
import { Sandbox, write } from "@test/support/patches/sandbox"

let box: Sandbox
beforeEach(() => {
  box = new Sandbox()
})
afterEach(() => box.dispose())

describe("ClockTicks", () => {
  it("asks the system for its clock ticks", () => {
    expect(clockTicks()).toBeGreaterThan(0)
  })
})

describe("ProcServiceAdapter", () => {
  it("returns when the newest opencode server started", async () => {
    const proc = box.proc(1_000_000, 50)
    // An older server, a server whose stat vanished, a process that is not opencode, and /proc/self.
    write(path.join(proc, "7", "cmdline"), "opencode\0serve\0")
    write(path.join(proc, "7", "stat"), `7 (open code) S ${Array.from({ length: 30 }, (_, i) => (i === 19 ? "1000" : "0")).join(" ")}`)
    write(path.join(proc, "8", "cmdline"), "/bin/opencode\0serve\0")
    write(path.join(proc, "9", "cmdline"), "/usr/bin/zsh\0-c\0opencode serve\0")
    write(path.join(proc, "10", "cmdline"), "/bin/opencode\0run\0")
    mkdirSync(path.join(proc, "self"))
    expect(await new ProcServiceAdapter(proc, 100).startedAt()).toBe((1_000_000 + 50) * 1000)
  })

  it("recognises the opencode.exe binary of the bun-installed CLI", async () => {
    const proc = box.proc(1_000_000, 50)
    write(path.join(proc, "11", "cmdline"), "/home/u/.bun/install/global/node_modules/@opencode/cli/bin/opencode.exe\0serve\0--service\0")
    write(path.join(proc, "11", "stat"), `11 (opencode.exe) S ${Array.from({ length: 30 }, (_, i) => (i === 18 ? "9000" : "0")).join(" ")}`)
    write(path.join(proc, "12", "cmdline"), "/bin/opencode.exe.bak\0serve\0")
    write(path.join(proc, "12", "stat"), `12 (x) S ${Array.from({ length: 30 }, (_, i) => (i === 18 ? "99000" : "0")).join(" ")}`)
    expect(await new ProcServiceAdapter(proc, 100).startedAt()).toBe((1_000_000 + 90) * 1000)
  })

  it("returns null without a boot time or without a server", async () => {
    const empty = path.join(box.home, "proc-empty")
    write(path.join(empty, "stat"), "cpu 1\n")
    expect(await new ProcServiceAdapter(empty, 100).startedAt()).toBeNull()
    const none = path.join(box.home, "proc-none")
    write(path.join(none, "stat"), "btime 5\n")
    expect(await new ProcServiceAdapter(none, 100).startedAt()).toBeNull()
  })
})

describe("NotifySendAdapter", () => {
  it("calls notify-send with the title and body, and fails when it fails", async () => {
    const ok = box.notifier()
    await new NotifySendAdapter(ok.command).notify("Title", "Body text")
    expect(readFileSync(ok.calls, "utf8")).toBe("--app-name=opencode-session-manager|--urgency=normal|--icon=dialog-warning|Title|Body text|\n")
    const failing = box.notifier(3)
    await expect(new NotifySendAdapter(failing.command).notify("T", "B")).rejects.toThrow()
  })
})
