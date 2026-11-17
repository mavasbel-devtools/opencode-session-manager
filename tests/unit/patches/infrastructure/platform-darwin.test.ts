import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { chmodSync, readFileSync } from "node:fs"
import path from "node:path"
import { KillZeroLivenessAdapter } from "@session-manager/infrastructure/adapters/outbound/platform/darwin/KillZeroLivenessAdapter"
import { OsascriptNotifierAdapter } from "@session-manager/infrastructure/adapters/outbound/platform/darwin/OsascriptNotifierAdapter"
import { PsServiceAdapter } from "@session-manager/infrastructure/adapters/outbound/platform/darwin/PsServiceAdapter"
import { Sandbox, write } from "@test/support/patches/sandbox"

let box: Sandbox
beforeEach(() => {
  box = new Sandbox()
})
afterEach(() => box.dispose())

/** A `ps` stand-in printing `rows` for `ps -axo pid=,lstart=,args=`. */
const ps = (rows: readonly string[]) => {
  const command = write(path.join(box.home, "bin", "ps"), `#!/bin/sh\n${rows.map((row) => `echo '${row}'`).join("\n")}\n`)
  chmodSync(command, 0o755)
  return command
}

describe("PsServiceAdapter", () => {
  it("returns when the newest opencode server started", async () => {
    const command = ps([
      " 4242 Mon Nov 17 10:00:00 2026 /opt/homebrew/bin/opencode serve --service",
      " 99 Wed Jan  1 00:00:00 2025 /usr/bin/zsh",
      " 100 Mon Nov 17 09:00:00 2026 /bin/opencode run",
      "garbage row",
    ])
    expect(await new PsServiceAdapter(command).startedAt()).toBe(new Date(2026, 10, 17, 10, 0, 0).getTime())
  })

  it("returns null without a server", async () => {
    expect(await new PsServiceAdapter(ps([" 99 Wed Jan  1 00:00:00 2025 /usr/bin/zsh"])).startedAt()).toBeNull()
  })
})

describe("KillZeroLivenessAdapter", () => {
  it("sees this process alive and an absent pid gone", async () => {
    const liveness = new KillZeroLivenessAdapter()
    expect([await liveness.isAlive(process.pid), await liveness.isAlive(2 ** 30)]).toEqual([true, false])
    // pid 1 (init) exists but is someone else's: EPERM when unprivileged, success when root.
    expect(await liveness.isAlive(1)).toBe(true)
  })
})

describe("OsascriptNotifierAdapter", () => {
  it("shows the notification with the title, and fails when osascript fails", async () => {
    const { command, calls } = box.notifier()
    await new OsascriptNotifierAdapter(command).notify("Title", "Body text")
    expect(readFileSync(calls, "utf8")).toContain("display notification")
    const failing = write(path.join(box.home, "bin", "osascript-fail"), "#!/bin/sh\nexit 3\n")
    chmodSync(failing, 0o755)
    await expect(new OsascriptNotifierAdapter(failing).notify("T", "B")).rejects.toThrow()
  })
})
