import { RenameProbeHoldersAdapter } from "@session-manager/infrastructure/adapters/outbound/platform/win32/RenameProbeHoldersAdapter"
import { CimServiceAdapter } from "@session-manager/infrastructure/adapters/outbound/platform/win32/CimServiceAdapter"
import { GetProcessLivenessAdapter } from "@session-manager/infrastructure/adapters/outbound/platform/win32/GetProcessLivenessAdapter"
import { PowerShellToastNotifierAdapter } from "@session-manager/infrastructure/adapters/outbound/platform/win32/PowerShellToastNotifierAdapter"
import { TasklistAdapter } from "@session-manager/infrastructure/adapters/outbound/platform/win32/TasklistAdapter"
import type { PatchesPlatformAdapters, PatchesPlatformFactory, PlatformAdapters, PlatformFactory } from "@session-manager/main/cli/platform"

/** Windows asks `tasklist` who runs, and probes a held file by renaming it (refused while open). */
export const win32Adapters: PlatformFactory = (fileSystem, pid): PlatformAdapters => ({
  processes: new TasklistAdapter("tasklist"),
  holders: new RenameProbeHoldersAdapter(fileSystem, pid),
  image: "opencode.exe",
})

/** The patches half on Windows: the server start from `Get-CimInstance`, liveness from `Get-Process`, a PowerShell toast. */
export const win32PatchesAdapters: PatchesPlatformFactory = (settings): PatchesPlatformAdapters => ({
  service: new CimServiceAdapter("powershell"),
  liveness: new GetProcessLivenessAdapter("powershell"),
  notifier: new PowerShellToastNotifierAdapter(settings.notifyCommand ?? "powershell"),
})
