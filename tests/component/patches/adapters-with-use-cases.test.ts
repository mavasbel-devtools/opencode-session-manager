import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { readFileSync, statSync } from "node:fs"
import path from "node:path"
import { ApplyUseCase } from "@session-manager/application/patches/ApplyUseCase"
import { ChangeWriter } from "@session-manager/application/patches/ChangeWriter"
import { CheckUseCase } from "@session-manager/application/patches/CheckUseCase"
import { EffectUseCase } from "@session-manager/application/patches/EffectUseCase"
import { InstallationCatalog } from "@session-manager/application/patches/InstallationCatalog"
import { NotifyUseCase } from "@session-manager/application/patches/NotifyUseCase"
import { PatchInspector } from "@session-manager/application/patches/PatchInspector"
import { ReleaseCatalog } from "@session-manager/application/patches/ReleaseCatalog"
import { StatusUseCase } from "@session-manager/application/patches/StatusUseCase"
import { UndoUseCase } from "@session-manager/application/patches/UndoUseCase"
import { OpencodeCacheInstallationsAdapter } from "@session-manager/infrastructure/adapters/outbound/magic-context/OpencodeCacheInstallationsAdapter"
import { Sha256Adapter } from "@session-manager/infrastructure/adapters/outbound/crypto/Sha256Adapter"
import { FileKeyValueAdapter } from "@session-manager/infrastructure/adapters/outbound/fs/FileKeyValueAdapter"
import { JsonDerivedReleasesAdapter } from "@session-manager/infrastructure/adapters/outbound/fs/JsonDerivedReleasesAdapter"
import { FsBackupAdapter } from "@session-manager/infrastructure/adapters/outbound/fs/FsBackupAdapter"
import { JsonlAuditLogAdapter } from "@session-manager/infrastructure/adapters/outbound/fs/JsonlAuditLogAdapter"
import { NodeFilesAdapter } from "@session-manager/infrastructure/adapters/outbound/fs/NodeFilesAdapter"
import { TextFileAdapter } from "@session-manager/infrastructure/adapters/outbound/fs/TextFileAdapter"
import { NotifySendAdapter } from "@session-manager/infrastructure/adapters/outbound/platform/linux/NotifySendAdapter"
import { ProcServiceAdapter } from "@session-manager/infrastructure/adapters/outbound/platform/linux/ProcServiceAdapter"
import { SystemClockAdapter } from "@session-manager/infrastructure/adapters/outbound/system/SystemClockAdapter"
import { executeThresholdMin } from "@session-manager/domain/patch-definitions/execute-threshold-min"
import { Sandbox } from "@test/support/patches/sandbox"

let box: Sandbox
beforeEach(() => {
  box = new Sandbox()
})
afterEach(() => box.dispose())

/** The patch checked against 0.47.0 (no-session-model-fallback is checked only against 0.49.15, 0.49.19 and 0.49.35). */
const PATCHES = [executeThresholdMin]

/** The use cases over the real file-system adapters, on a sandboxed copy of Magic Context 0.47.0. */
function compose() {
  const files = new NodeFilesAdapter()
  const hash = new Sha256Adapter()
  const audit = new JsonlAuditLogAdapter(path.join(box.state, "audit.log"))
  const backups = new FsBackupAdapter(path.join(box.data, "backups"))
  const patches = PATCHES
  const catalog = new InstallationCatalog(
    new OpencodeCacheInstallationsAdapter(box.installations),
    new TextFileAdapter(path.join(box.config, "opencode", "opencode.jsonc")),
    patches,
  )
  const inspector = new PatchInspector(files, hash, new ReleaseCatalog(new JsonDerivedReleasesAdapter(path.join(box.data, "derived.json"))), patches)
  const writer = new ChangeWriter(files, hash, backups, audit, new SystemClockAdapter())
  const status = new StatusUseCase(catalog, inspector, patches)
  return {
    status,
    check: new CheckUseCase(status),
    apply: new ApplyUseCase(catalog, inspector, writer, hash, audit),
    undo: new UndoUseCase(catalog, inspector, writer, backups, hash, audit),
  }
}

describe("apply and undo over the real adapters", () => {
  it("patches the installed copy, keeps a read-only backup and a private audit log, and restores byte for byte", async () => {
    const root = box.install("0.47.0")
    box.pin("0.47.0")
    const original = readFileSync(path.join(root, "dist/v2/server-50hvkg3v.js"))
    const c = compose()
    expect((await c.apply.apply({})).results[0]!.outcome).toBe("applied")
    expect((await c.check.check()).ok).toBe(true)
    const backup = path.join(box.data, "backups", "0.47.0", "execute-threshold-min", "dist/v2/server-50hvkg3v.js@dd36bd4a24181727645ec0267ef1d67c657865cd914d842c9739eaecbabbb105")
    expect([statSync(backup).mode & 0o777, statSync(path.join(box.state, "audit.log")).mode & 0o777]).toEqual([0o444, 0o600])
    expect((await c.undo.undo({})).results[0]!.outcome).toBe("reverted")
    expect(readFileSync(path.join(root, "dist/v2/server-50hvkg3v.js")).equals(original)).toBe(true)
    expect(readFileSync(path.join(box.state, "audit.log"), "utf8").trim().split("\n")).toHaveLength(4)
  })
})

describe("notify over the real store and notify-send", () => {
  it("remembers across separate runs that a problem was already announced", async () => {
    box.install("0.47.0")
    box.pin("0.47.0")
    const notifier = box.notifier()
    const run = () =>
      new NotifyUseCase(compose().check, new NotifySendAdapter(notifier.command), new FileKeyValueAdapter(path.join(box.state, "kv"))).notify()
    expect([(await run()).notified, (await run()).notified]).toEqual([true, false])
    expect(readFileSync(notifier.calls, "utf8").split("\n").filter(Boolean)).toHaveLength(1)
  })
})

describe("effect over the real log and /proc readers", () => {
  it("reads the log from the server's start", async () => {
    box.threshold(13)
    const log = box.log([
      "[2026-01-01T00:00:00.000Z] [magic-context][s] compartment trigger: not firing at 1.0% — below proactive floor (63%)",
      "[2030-01-01T00:00:00.000Z] [magic-context][s] compartment trigger: not firing at 1.0% — below proactive floor (11%)",
    ])
    const proc = box.proc(Date.parse("2029-12-31T00:00:00Z") / 1000, 10)
    const effect = new EffectUseCase(new TextFileAdapter(log), new ProcServiceAdapter(proc, 100), new TextFileAdapter(path.join(box.config, "cortexkit", "magic-context.jsonc")))
    const report = await effect.effect(null)
    expect([report.summary.linesRead, report.summary.effectiveThreshold, report.verdict]).toEqual([1, 13, "respected"])
  })
})
