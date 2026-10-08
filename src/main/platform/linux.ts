import { ProcFdHoldersAdapter } from "#infrastructure/adapters/outbound/platform/linux/ProcFdHoldersAdapter.ts"
import { ProcProcessListAdapter } from "#infrastructure/adapters/outbound/platform/linux/ProcProcessListAdapter.ts"
import type { PlatformAdapters, PlatformFactory } from "#main/platform.ts"

/** Linux reads `/proc`: `comm` names the running processes, `fd` links name the holders. */
export const linuxAdapters: PlatformFactory = (): PlatformAdapters => ({
  processes: new ProcProcessListAdapter("/proc"),
  holders: new ProcFdHoldersAdapter("/proc"),
  image: "opencode",
})
