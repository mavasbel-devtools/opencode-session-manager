import { test } from "bun:test"
import assert from "node:assert/strict"
import { UnsupportedPlatformError } from "@session-manager/domain/errors/UnsupportedPlatformError"
import { LsofHoldersAdapter } from "@session-manager/infrastructure/adapters/outbound/platform/darwin/LsofHoldersAdapter"
import { PsProcessListAdapter } from "@session-manager/infrastructure/adapters/outbound/platform/darwin/PsProcessListAdapter"
import { ProcFdHoldersAdapter } from "@session-manager/infrastructure/adapters/outbound/platform/linux/ProcFdHoldersAdapter"
import { ProcProcessListAdapter } from "@session-manager/infrastructure/adapters/outbound/platform/linux/ProcProcessListAdapter"
import { KillZeroLivenessAdapter } from "@session-manager/infrastructure/adapters/outbound/platform/darwin/KillZeroLivenessAdapter"
import { OsascriptNotifierAdapter } from "@session-manager/infrastructure/adapters/outbound/platform/darwin/OsascriptNotifierAdapter"
import { PsServiceAdapter } from "@session-manager/infrastructure/adapters/outbound/platform/darwin/PsServiceAdapter"
import { NotifySendAdapter } from "@session-manager/infrastructure/adapters/outbound/platform/linux/NotifySendAdapter"
import { ProcLivenessAdapter } from "@session-manager/infrastructure/adapters/outbound/platform/linux/ProcLivenessAdapter"
import { ProcServiceAdapter } from "@session-manager/infrastructure/adapters/outbound/platform/linux/ProcServiceAdapter"
import { RenameProbeHoldersAdapter } from "@session-manager/infrastructure/adapters/outbound/platform/win32/RenameProbeHoldersAdapter"
import { CimServiceAdapter } from "@session-manager/infrastructure/adapters/outbound/platform/win32/CimServiceAdapter"
import { GetProcessLivenessAdapter } from "@session-manager/infrastructure/adapters/outbound/platform/win32/GetProcessLivenessAdapter"
import { PowerShellToastNotifierAdapter } from "@session-manager/infrastructure/adapters/outbound/platform/win32/PowerShellToastNotifierAdapter"
import { TasklistAdapter } from "@session-manager/infrastructure/adapters/outbound/platform/win32/TasklistAdapter"
import { patchesPlatformAdapters, platformAdapters, SUPPORTED_PLATFORMS } from "@session-manager/main/cli/platform"
import { FakeFileSystem } from "@test/support/maintenance/fakes/file-system"

// The per-adapter tests live beside the code they cover in `tests/unit/platform/<p>/`; only the
// loader test stays here, because it wires every platform at once.

test("platformAdapters wires each supported platform and refuses any other", async () => {
  const fileSystem = new FakeFileSystem()
  const linux = await platformAdapters("linux", fileSystem, 1)
  assert.ok(linux.processes instanceof ProcProcessListAdapter)
  assert.ok(linux.holders instanceof ProcFdHoldersAdapter)
  assert.equal(linux.image, "opencode")

  const windows = await platformAdapters("win32", fileSystem, 1)
  assert.ok(windows.processes instanceof TasklistAdapter)
  assert.ok(windows.holders instanceof RenameProbeHoldersAdapter)
  assert.equal(windows.image, "opencode.exe")

  const darwin = await platformAdapters("darwin", fileSystem, 1)
  assert.ok(darwin.processes instanceof PsProcessListAdapter)
  assert.ok(darwin.holders instanceof LsofHoldersAdapter)
  assert.equal(darwin.image, "opencode")

  assert.deepEqual(SUPPORTED_PLATFORMS, ["linux", "win32", "darwin"])

  const linuxPatches = await patchesPlatformAdapters("linux", { proc: "/proc", notifyCommand: undefined })
  assert.ok(linuxPatches.service instanceof ProcServiceAdapter)
  assert.ok(linuxPatches.liveness instanceof ProcLivenessAdapter)
  assert.ok(linuxPatches.notifier instanceof NotifySendAdapter)

  const windowsPatches = await patchesPlatformAdapters("win32", { proc: "/proc", notifyCommand: undefined })
  assert.ok(windowsPatches.service instanceof CimServiceAdapter)
  assert.ok(windowsPatches.liveness instanceof GetProcessLivenessAdapter)
  assert.ok(windowsPatches.notifier instanceof PowerShellToastNotifierAdapter)

  const darwinPatches = await patchesPlatformAdapters("darwin", { proc: "/proc", notifyCommand: undefined })
  assert.ok(darwinPatches.service instanceof PsServiceAdapter)
  assert.ok(darwinPatches.liveness instanceof KillZeroLivenessAdapter)
  assert.ok(darwinPatches.notifier instanceof OsascriptNotifierAdapter)

  await assert.rejects(patchesPlatformAdapters("freebsd", { proc: "/proc", notifyCommand: undefined }), (error: unknown) => {
    assert.ok(error instanceof UnsupportedPlatformError)
    assert.equal(error.message, "unsupported platform: freebsd (supported: linux, win32, darwin)")
    return true
  })
  await assert.rejects(platformAdapters("toString", fileSystem, 1), UnsupportedPlatformError)
  await assert.rejects(platformAdapters("freebsd", fileSystem, 1), (error: unknown) => {
    assert.ok(error instanceof UnsupportedPlatformError)
    assert.equal(error.message, "unsupported platform: freebsd (supported: linux, win32, darwin)")
    return true
  })
})
