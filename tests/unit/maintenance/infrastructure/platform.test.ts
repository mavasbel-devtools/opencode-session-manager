import { test } from "bun:test"
import assert from "node:assert/strict"
import { UnsupportedPlatformError } from "@session-manager/domain/errors/UnsupportedPlatformError"
import { LsofHoldersAdapter } from "@session-manager/infrastructure/adapters/outbound/platform/darwin/LsofHoldersAdapter"
import { PsProcessListAdapter } from "@session-manager/infrastructure/adapters/outbound/platform/darwin/PsProcessListAdapter"
import { ProcFdHoldersAdapter } from "@session-manager/infrastructure/adapters/outbound/platform/linux/ProcFdHoldersAdapter"
import { ProcProcessListAdapter } from "@session-manager/infrastructure/adapters/outbound/platform/linux/ProcProcessListAdapter"
import { RenameProbeHoldersAdapter } from "@session-manager/infrastructure/adapters/outbound/platform/win32/RenameProbeHoldersAdapter"
import { TasklistAdapter } from "@session-manager/infrastructure/adapters/outbound/platform/win32/TasklistAdapter"
import { platformAdapters, SUPPORTED_PLATFORMS } from "@session-manager/main/cli/platform"
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
  await assert.rejects(platformAdapters("toString", fileSystem, 1), UnsupportedPlatformError)
  await assert.rejects(platformAdapters("freebsd", fileSystem, 1), (error: unknown) => {
    assert.ok(error instanceof UnsupportedPlatformError)
    assert.equal(error.message, "unsupported platform: freebsd (supported: linux, win32, darwin)")
    return true
  })
})
