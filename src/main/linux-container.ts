import { ProcFdHoldersAdapter } from "@session-manager/infrastructure/adapters/outbound/platform/linux/ProcFdHoldersAdapter"
import { ProcLivenessAdapter } from "@session-manager/infrastructure/adapters/outbound/platform/linux/ProcLivenessAdapter"
import { ProcProcessListAdapter } from "@session-manager/infrastructure/adapters/outbound/platform/linux/ProcProcessListAdapter"
import { NotifySendAdapter } from "@session-manager/infrastructure/adapters/outbound/platform/linux/NotifySendAdapter"
import { ProcServiceAdapter } from "@session-manager/infrastructure/adapters/outbound/platform/linux/ProcServiceAdapter"
import { clockTicks } from "@session-manager/infrastructure/adapters/outbound/platform/linux/ClockTicks"
import type { PatchesPlatformAdapters, PatchesPlatformFactory, PlatformAdapters, PlatformFactory } from "@session-manager/main/cli/platform"

/** Linux reads `/proc`: `comm` names the running processes, `fd` links name the holders. */
export const linuxAdapters: PlatformFactory = (): PlatformAdapters => ({
  processes: new ProcProcessListAdapter("/proc"),
  holders: new ProcFdHoldersAdapter("/proc"),
  image: "opencode",
})

/** The patches half on Linux: the server start from `/proc`, liveness from `/proc`, `notify-send`. */
export const linuxPatchesAdapters: PatchesPlatformFactory = (settings): PatchesPlatformAdapters => ({
  service: new ProcServiceAdapter(settings.proc, clockTicks()),
  liveness: new ProcLivenessAdapter(settings.proc),
  notifier: new NotifySendAdapter(settings.notifyCommand ?? "notify-send"),
})
