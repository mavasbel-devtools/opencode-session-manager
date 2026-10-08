import { ProcFdHoldersAdapter } from "@session-manager/infrastructure/adapters/outbound/platform/linux/ProcFdHoldersAdapter"
import { ProcProcessListAdapter } from "@session-manager/infrastructure/adapters/outbound/platform/linux/ProcProcessListAdapter"
import type { PlatformAdapters, PlatformFactory } from "@session-manager/main/cli/platform"

/** Linux reads `/proc`: `comm` names the running processes, `fd` links name the holders. */
export const linuxAdapters: PlatformFactory = (): PlatformAdapters => ({
  processes: new ProcProcessListAdapter("/proc"),
  holders: new ProcFdHoldersAdapter("/proc"),
  image: "opencode",
})
