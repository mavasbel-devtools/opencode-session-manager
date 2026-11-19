import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { AdoptionRecorder } from "@session-manager/application/patches/follow/AdoptionRecorder"
import { ConfigEntrySet } from "@session-manager/application/patches/follow/ConfigEntrySet"
import { EntrySwitcher } from "@session-manager/application/patches/follow/EntrySwitcher"
import { PluginEntryEditor } from "@session-manager/application/patches/follow/PluginEntryEditor"
import { ReleaseProver } from "@session-manager/application/patches/follow/ReleaseProver"
import { ReleaseStager } from "@session-manager/application/patches/follow/ReleaseStager"
import { FollowUseCase } from "@session-manager/application/patches/FollowUseCase"
import { InstallationCatalog } from "@session-manager/application/patches/InstallationCatalog"
import { FollowRollbackUseCase } from "@session-manager/application/patches/FollowRollbackUseCase"
import { magicContextEntry, MAGIC_CONTEXT_PACKAGE } from "@session-manager/domain/services/Jsonc"
import { CompositeInstallationsAdapter } from "@session-manager/infrastructure/adapters/outbound/magic-context/CompositeInstallationsAdapter"
import { ManagedInstallationsAdapter } from "@session-manager/infrastructure/adapters/outbound/magic-context/ManagedInstallationsAdapter"
import { OpencodeCacheInstallationsAdapter } from "@session-manager/infrastructure/adapters/outbound/magic-context/OpencodeCacheInstallationsAdapter"
import { Sha256Adapter } from "@session-manager/infrastructure/adapters/outbound/crypto/Sha256Adapter"
import { FileKeyValueAdapter } from "@session-manager/infrastructure/adapters/outbound/fs/FileKeyValueAdapter"
import { FsFollowLockAdapter } from "@session-manager/infrastructure/adapters/outbound/fs/FsFollowLockAdapter"
import { FsBackupAdapter } from "@session-manager/infrastructure/adapters/outbound/fs/FsBackupAdapter"
import { FsEvidenceAdapter } from "@session-manager/infrastructure/adapters/outbound/fs/FsEvidenceAdapter"
import { FsManagedStoreAdapter } from "@session-manager/infrastructure/adapters/outbound/fs/FsManagedStoreAdapter"
import { JsonDerivedReleasesAdapter } from "@session-manager/infrastructure/adapters/outbound/fs/JsonDerivedReleasesAdapter"
import { JsonlAuditLogAdapter } from "@session-manager/infrastructure/adapters/outbound/fs/JsonlAuditLogAdapter"
import { NodeFilesAdapter } from "@session-manager/infrastructure/adapters/outbound/fs/NodeFilesAdapter"
import { TextFileAdapter } from "@session-manager/infrastructure/adapters/outbound/fs/TextFileAdapter"
import { NotifySendAdapter } from "@session-manager/infrastructure/adapters/outbound/platform/linux/NotifySendAdapter"
import { ArboristInstallerAdapter } from "@session-manager/infrastructure/adapters/outbound/npm/ArboristInstallerAdapter"
import { NpmPackumentAdapter } from "@session-manager/infrastructure/adapters/outbound/npm/NpmPackumentAdapter"
import { OpencodeLivePluginsAdapter } from "@session-manager/infrastructure/adapters/outbound/opencode2/OpencodeLivePluginsAdapter"
import { OpencodeSandboxAdapter } from "@session-manager/infrastructure/adapters/outbound/opencode2/OpencodeSandboxAdapter"
import { BunTranspileAdapter } from "@session-manager/infrastructure/adapters/outbound/parse/BunTranspileAdapter"
import { SystemClockAdapter } from "@session-manager/infrastructure/adapters/outbound/system/SystemClockAdapter"
import { PATCHES } from "@session-manager/domain/patch-definitions/index"
import { LocalRegistry, tarball } from "@test/support/patches/registry"
import { Sandbox } from "@test/support/patches/sandbox"

let box: Sandbox
let registry: LocalRegistry
let live: ReturnType<typeof Bun.serve>
beforeEach(() => {
  box = new Sandbox()
  box.install("0.49.15")
  box.pin("0.49.15")
  box.threshold(13)
  registry = new LocalRegistry([tarball(box.home, "0.49.35")])
  live = box.liveServer(3)
})
afterEach(() => {
  live.stop(true)
  registry.stop()
  box.dispose()
})

/** follow and rollback over the real adapters: a local registry, real Arborist, the OpenCode stand-in, a running-server stand-in. */
function compose() {
  const files = new NodeFilesAdapter()
  const hash = new Sha256Adapter()
  const clock = new SystemClockAdapter()
  const own = path.join(box.data, "opencode-session-manager", "patches")
  const state = path.join(box.state, "opencode-session-manager", "patches")
  const config = path.join(box.config, "opencode", "opencode.jsonc")
  const tui = path.join(box.config, "opencode", "tui.jsonc")
  const audit = new JsonlAuditLogAdapter(path.join(state, "audit.log"))
  const store = new FileKeyValueAdapter(state)
  const managed = new FsManagedStoreAdapter(path.join(own, "installs"))
  const liveAdapter = new OpencodeLivePluginsAdapter(path.join(box.state, "opencode", "service.json"))
  const lock = new FsFollowLockAdapter(path.join(state, "follow.lock"), { isAlive: async () => true })
  const magicContextConfig = new TextFileAdapter(path.join(box.config, "cortexkit", "magic-context.jsonc"))
  const catalog = new InstallationCatalog(
    new CompositeInstallationsAdapter([new OpencodeCacheInstallationsAdapter(box.installations), new ManagedInstallationsAdapter(path.join(own, "installs"))]),
    new TextFileAdapter(config),
    PATCHES,
  )
  const switcher = new EntrySwitcher(
    new ConfigEntrySet(
      files,
      new PluginEntryEditor(files, hash, new FsBackupAdapter(path.join(own, "backups")), config, "opencode.jsonc"),
      new PluginEntryEditor(files, hash, new FsBackupAdapter(path.join(own, "backups")), tui, "tui.jsonc"),
    ),
    liveAdapter,
    new TextFileAdapter(path.join(box.tmp, "opencode2", "magic-context", "magic-context.log")),
    magicContextConfig,
    clock,
    { timeoutMs: 3_000, pollMs: 100, settleMs: 10 },
  )
  const notifier = box.notifier()
  const recorder = new AdoptionRecorder(new JsonDerivedReleasesAdapter(path.join(own, "derived.json")), new FsEvidenceAdapter(path.join(state, "evidence")), audit, new NotifySendAdapter(notifier.command), store, clock, config, tui)
  const sandbox = new OpencodeSandboxAdapter({ opencode: box.opencodeStandIn("ok"), parent: box.tmp, timeoutMs: 5_000, settleMs: 10, pollMs: 50 })
  const stager = new ReleaseStager(managed, new ArboristInstallerAdapter(registry.url, path.join(box.home, ".npm")), files, hash, new BunTranspileAdapter(), PATCHES)
  return {
    config,
    tui,
    follow: new FollowUseCase(lock, catalog, new NpmPackumentAdapter(registry.url), managed, stager, new ReleaseProver(sandbox, magicContextConfig), switcher, liveAdapter, recorder, audit, clock),
    rollback: new FollowRollbackUseCase(lock, switcher, store, recorder, audit, clock, files),
  }
}

describe("follow over the real adapters", () => {
  it("adopts the newer release patched, confirmed by every location of the running server, and rolls back", async () => {
    const app = compose()
    const root = path.join(box.data, "opencode-session-manager", "patches", "installs", "0.49.35", "node_modules", MAGIC_CONTEXT_PACKAGE)
    const report = await app.follow.follow(null)
    expect([report.outcome, report.to, magicContextEntry(readFileSync(app.config, "utf8"))]).toEqual(["adopted", root, root])
    expect(report.steps.find((step) => step.step === "confirm")!.detail).toStartWith("3 locations load it (active): /work/0, /work/1, /work/2")
    expect(readFileSync(path.join(root, "dist/index-nxrsns5x.js"), "utf8")).toContain("min(1).max(90")
    expect(readFileSync(path.join(root, "dist/index-b6xz3qbe.js"), "utf8")).toContain("return Math.max(0, requested); /* mc-patches: refusal-recovery */")
    const back = await app.rollback.rollback()
    expect([back.outcome, magicContextEntry(readFileSync(app.config, "utf8"))]).toEqual(["rolled-back", `${MAGIC_CONTEXT_PACKAGE}@0.49.15`])
  }, 60_000)

  it("publishes the entry to opencode.jsonc and tui.jsonc together, and rolls both back", async () => {
    const app = compose()
    const before = readFileSync(app.config, "utf8")
    writeFileSync(app.tui, before)
    const root = path.join(box.data, "opencode-session-manager", "patches", "installs", "0.49.35", "node_modules", MAGIC_CONTEXT_PACKAGE)
    const report = await app.follow.follow(null)
    expect([report.outcome, magicContextEntry(readFileSync(app.config, "utf8")), magicContextEntry(readFileSync(app.tui, "utf8"))]).toEqual(["adopted", root, root])
    expect(report.steps.find((step) => step.step === "publish")!.detail).toContain("tui.jsonc")
    expect(readFileSync(report.evidence!, "utf8")).toContain("tui.jsonc entry:")
    const back = await app.rollback.rollback()
    expect([back.outcome, readFileSync(app.config, "utf8"), readFileSync(app.tui, "utf8")]).toEqual(["rolled-back", before, before])
  }, 60_000)

  it("publishes only opencode.jsonc when tui.jsonc is absent, and records that", async () => {
    const app = compose()
    const before = readFileSync(app.config, "utf8")
    const report = await app.follow.follow(null)
    expect(report.outcome).toBe("adopted")
    expect(report.steps.find((step) => step.step === "publish")!.detail).not.toContain("tui.jsonc")
    expect(report.steps.find((step) => step.step === "record")!.detail).toContain("tui.jsonc is absent")
    expect(readFileSync(report.evidence!, "utf8")).toContain("tui.jsonc: absent; only opencode.jsonc changed.")
    expect(readFileSync(app.config, "utf8")).not.toBe(before)
  }, 60_000)
})
