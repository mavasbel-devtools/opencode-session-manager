import { LsofHoldersAdapter } from "@session-manager/infrastructure/adapters/outbound/platform/darwin/LsofHoldersAdapter"
import { PsProcessListAdapter } from "@session-manager/infrastructure/adapters/outbound/platform/darwin/PsProcessListAdapter"
import type { PlatformAdapters, PlatformFactory } from "@session-manager/main/cli/platform"

/** macOS asks `ps` who runs, and `lsof` who holds the file open. */
export const darwinAdapters: PlatformFactory = (): PlatformAdapters => ({
  processes: new PsProcessListAdapter("/bin/ps"),
  holders: new LsofHoldersAdapter("/usr/sbin/lsof"),
  image: "opencode",
})
