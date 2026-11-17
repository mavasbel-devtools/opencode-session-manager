import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { chmodSync, readFileSync } from "node:fs"
import path from "node:path"
import { CimServiceAdapter } from "@session-manager/infrastructure/adapters/outbound/platform/win32/CimServiceAdapter"
import { GetProcessLivenessAdapter } from "@session-manager/infrastructure/adapters/outbound/platform/win32/GetProcessLivenessAdapter"
import { PowerShellToastNotifierAdapter } from "@session-manager/infrastructure/adapters/outbound/platform/win32/PowerShellToastNotifierAdapter"
import { Sandbox, write } from "@test/support/patches/sandbox"

let box: Sandbox
beforeEach(() => {
  box = new Sandbox()
})
afterEach(() => box.dispose())

/** A PowerShell stand-in: prints `stdout` and exits `code` for any invocation. */
const powershell = (stdout: readonly string[], code = 0) => {
  const command = write(
    path.join(box.home, "bin", "powershell"),
    `#!/bin/sh\n${stdout.map((line) => `echo '${line}'`).join("\n")}\nexit ${code}\n`,
  )
  chmodSync(command, 0o755)
  return command
}

describe("CimServiceAdapter", () => {
  it("returns when the newest opencode server started", async () => {
    const command = powershell(["4242|2026-11-17T10:00:00.000Z", "99|2025-01-01T00:00:00.000Z", "garbage row"])
    expect(await new CimServiceAdapter(command).startedAt()).toBe(Date.parse("2026-11-17T10:00:00.000Z"))
  })

  it("returns null without a server", async () => {
    expect(await new CimServiceAdapter(powershell([])).startedAt()).toBeNull()
  })
})

describe("GetProcessLivenessAdapter", () => {
  it("is alive when PowerShell finds the pid, and gone when it fails", async () => {
    expect(await new GetProcessLivenessAdapter(powershell([])).isAlive(4242)).toBe(true)
    expect(await new GetProcessLivenessAdapter(powershell([], 1)).isAlive(4242)).toBe(false)
  })

  it("rejects nonsense pids without running anything", async () => {
    const command = powershell([], 3)
    expect(await new GetProcessLivenessAdapter(command).isAlive(0)).toBe(false)
    expect(await new GetProcessLivenessAdapter(command).isAlive(-1)).toBe(false)
  })
})

describe("PowerShellToastNotifierAdapter", () => {
  it("passes the title and body as arguments, and fails when PowerShell fails", async () => {
    const calls = path.join(box.home, "toast-calls.txt")
    const command = write(path.join(box.home, "bin", "toast"), `#!/bin/sh\nprintf '%s|' "$@" >> '${calls}'\necho >> '${calls}'\nexit 0\n`)
    chmodSync(command, 0o755)
    await new PowerShellToastNotifierAdapter(command).notify("Title", "Body text")
    expect(readFileSync(calls, "utf8")).toContain("|Title|Body text|")
    await expect(new PowerShellToastNotifierAdapter(powershell([], 1)).notify("T", "B")).rejects.toThrow()
  })
})
