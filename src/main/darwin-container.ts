import { LsofHoldersAdapter } from "@session-manager/infrastructure/adapters/outbound/platform/darwin/LsofHoldersAdapter"
import { KillZeroLivenessAdapter } from "@session-manager/infrastructure/adapters/outbound/platform/darwin/KillZeroLivenessAdapter"
import { OsascriptNotifierAdapter } from "@session-manager/infrastructure/adapters/outbound/platform/darwin/OsascriptNotifierAdapter"
import { PsProcessListAdapter } from "@session-manager/infrastructure/adapters/outbound/platform/darwin/PsProcessListAdapter"
import { PsServiceAdapter } from "@session-manager/infrastructure/adapters/outbound/platform/darwin/PsServiceAdapter"
import type { PatchesPlatformAdapters, PatchesPlatformFactory, PlatformAdapters, PlatformFactory } from "@session-manager/main/cli/platform"

/** macOS asks `ps` who runs, and `lsof` who holds the file open. */
export const darwinAdapters: PlatformFactory = (): PlatformAdapters => ({
  processes: new PsProcessListAdapter("/bin/ps"),
  holders: new LsofHoldersAdapter("/usr/sbin/lsof"),
  image: "opencode",
})

/** The patches half on macOS: the server start from `ps`, liveness from `kill -0`, `osascript`. */
export const darwinPatchesAdapters: PatchesPlatformFactory = (settings): PatchesPlatformAdapters => ({
  service: new PsServiceAdapter("/bin/ps"),
  liveness: new KillZeroLivenessAdapter(),
  notifier: new OsascriptNotifierAdapter(settings.notifyCommand ?? "/usr/bin/osascript"),
})
