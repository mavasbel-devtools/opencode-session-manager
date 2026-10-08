import { RenameProbeHoldersAdapter } from "@session-manager/infrastructure/adapters/outbound/platform/win32/RenameProbeHoldersAdapter"
import { TasklistAdapter } from "@session-manager/infrastructure/adapters/outbound/platform/win32/TasklistAdapter"
import type { PlatformAdapters, PlatformFactory } from "@session-manager/main/cli/platform"

/** Windows asks `tasklist` who runs, and probes a held file by renaming it (refused while open). */
export const win32Adapters: PlatformFactory = (fileSystem, pid): PlatformAdapters => ({
  processes: new TasklistAdapter("tasklist"),
  holders: new RenameProbeHoldersAdapter(fileSystem, pid),
  image: "opencode.exe",
})
