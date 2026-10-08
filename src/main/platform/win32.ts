import { RenameProbeHoldersAdapter } from "#infrastructure/adapters/outbound/platform/win32/RenameProbeHoldersAdapter.ts"
import { TasklistAdapter } from "#infrastructure/adapters/outbound/platform/win32/TasklistAdapter.ts"
import type { PlatformAdapters, PlatformFactory } from "#main/platform.ts"

/** Windows asks `tasklist` who runs, and probes a held file by renaming it (refused while open). */
export const win32Adapters: PlatformFactory = (fileSystem, pid): PlatformAdapters => ({
  processes: new TasklistAdapter("tasklist"),
  holders: new RenameProbeHoldersAdapter(fileSystem, pid),
  image: "opencode.exe",
})
