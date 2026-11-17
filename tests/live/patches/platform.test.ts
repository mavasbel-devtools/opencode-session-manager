import { describe, expect, it } from "bun:test"
import { clockTicks } from "@session-manager/infrastructure/adapters/outbound/platform/linux/ClockTicks"
import { NotifySendAdapter } from "@session-manager/infrastructure/adapters/outbound/platform/linux/NotifySendAdapter"
import { ProcLivenessAdapter } from "@session-manager/infrastructure/adapters/outbound/platform/linux/ProcLivenessAdapter"
import { ProcServiceAdapter } from "@session-manager/infrastructure/adapters/outbound/platform/linux/ProcServiceAdapter"
import { KillZeroLivenessAdapter } from "@session-manager/infrastructure/adapters/outbound/platform/darwin/KillZeroLivenessAdapter"
import { OsascriptNotifierAdapter } from "@session-manager/infrastructure/adapters/outbound/platform/darwin/OsascriptNotifierAdapter"
import { PsServiceAdapter } from "@session-manager/infrastructure/adapters/outbound/platform/darwin/PsServiceAdapter"
import { CimServiceAdapter } from "@session-manager/infrastructure/adapters/outbound/platform/win32/CimServiceAdapter"
import { GetProcessLivenessAdapter } from "@session-manager/infrastructure/adapters/outbound/platform/win32/GetProcessLivenessAdapter"
import { PowerShellToastNotifierAdapter } from "@session-manager/infrastructure/adapters/outbound/platform/win32/PowerShellToastNotifierAdapter"
import type { NotifierPort } from "@session-manager/domain/ports/outbound/NotifierPort"
import type { ProcessLivenessPort } from "@session-manager/domain/ports/outbound/ProcessLivenessPort"
import type { ServicePort } from "@session-manager/domain/ports/outbound/ServicePort"
import { currentPlatform, requires } from "@test/support/platform"

/**
 * Live check, on the running OS, that the patches platform adapters work against the real
 * system: the server start time, liveness of this process, and a real desktop notification.
 */
function service(): ServicePort {
  switch (currentPlatform()) {
    case "darwin":
      return new PsServiceAdapter("/bin/ps")
    case "win32":
      return new CimServiceAdapter("powershell")
    default:
      return new ProcServiceAdapter("/proc", clockTicks())
  }
}

function liveness(): ProcessLivenessPort {
  switch (currentPlatform()) {
    case "darwin":
      return new KillZeroLivenessAdapter()
    case "win32":
      return new GetProcessLivenessAdapter("powershell")
    default:
      return new ProcLivenessAdapter("/proc")
  }
}

const notifierCommand = (): string | null => {
  switch (currentPlatform()) {
    case "darwin":
      return Bun.which("osascript")
    case "win32":
      return Bun.which("powershell")
    default:
      return Bun.which("notify-send")
  }
}

function notifier(): NotifierPort {
  switch (currentPlatform()) {
    case "darwin":
      return new OsascriptNotifierAdapter(notifierCommand()!)
    case "win32":
      return new PowerShellToastNotifierAdapter(notifierCommand()!)
    default:
      return new NotifySendAdapter(notifierCommand()!)
  }
}

describe("the patches platform adapters on this machine", () => {
  it("reads when the running OpenCode server started, if one runs", async () => {
    const started = await service().startedAt()
    if (started === null) expect(started).toBeNull()
    else expect([started > 0, started <= Date.now()]).toEqual([true, true])
  })

  it("sees this process alive", async () => {
    expect(await liveness().isAlive(process.pid)).toBe(true)
  })

  it.skipIf(requires(notifierCommand() === null, "the platform notifier"))("shows a desktop notification (requires the platform notifier)", async () => {
    await notifier().notify("opencode-session-manager", "patches platform live check")
  })
})
