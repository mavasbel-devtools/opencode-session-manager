import { ApplyUseCase } from "@session-manager/application/patches/ApplyUseCase"
import { ChangeWriter } from "@session-manager/application/patches/ChangeWriter"
import { CheckUseCase } from "@session-manager/application/patches/CheckUseCase"
import { InstallationCatalog } from "@session-manager/application/patches/InstallationCatalog"
import { PatchInspector } from "@session-manager/application/patches/PatchInspector"
import { ReleaseCatalog } from "@session-manager/application/patches/ReleaseCatalog"
import { StatusUseCase } from "@session-manager/application/patches/StatusUseCase"
import { UndoUseCase } from "@session-manager/application/patches/UndoUseCase"
import type { PatchDefinition } from "@session-manager/domain/model/patches/Patch"
import {
  copy,
  FakeAudit,
  FakeBackups,
  FakeClock,
  FakeDerived,
  FakeFiles,
  FakeHash,
  FakeInstallations,
  FakeText,
  PINNED_PLUGIN_CONFIG,
  ORIGINAL_A,
  ORIGINAL_B,
  ROOT,
  smallPatch,
} from "@test/support/patches/fakes"

/** The application wired to fakes: one installed 1.0.0 copy, pinned, with both files original. */
export function world(patches: readonly PatchDefinition[] = [smallPatch]) {
  const files = new FakeFiles({ [`${ROOT}/dist/a.js`]: ORIGINAL_A, [`${ROOT}/dist/b.js`]: ORIGINAL_B })
  const hash = new FakeHash()
  const installations = new FakeInstallations([copy()])
  const config = new FakeText(PINNED_PLUGIN_CONFIG)
  const backups = new FakeBackups()
  const audit = new FakeAudit()
  const catalog = new InstallationCatalog(installations, config, patches)
  const derived = new FakeDerived()
  const inspector = new PatchInspector(files, hash, new ReleaseCatalog(derived), patches)
  const writer = new ChangeWriter(files, hash, backups, audit, new FakeClock())
  const status = new StatusUseCase(catalog, inspector, patches)
  return {
    files,
    hash,
    installations,
    config,
    backups,
    audit,
    catalog,
    derived,
    status,
    check: new CheckUseCase(status),
    apply: new ApplyUseCase(catalog, inspector, writer, hash, audit),
    undo: new UndoUseCase(catalog, inspector, writer, backups, hash, audit),
  }
}
