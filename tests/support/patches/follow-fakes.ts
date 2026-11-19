import { AdoptionRecorder } from "@session-manager/application/patches/follow/AdoptionRecorder"
import { ConfigEntrySet } from "@session-manager/application/patches/follow/ConfigEntrySet"
import { EntrySwitcher } from "@session-manager/application/patches/follow/EntrySwitcher"
import { PluginEntryEditor } from "@session-manager/application/patches/follow/PluginEntryEditor"
import { ReleaseProver } from "@session-manager/application/patches/follow/ReleaseProver"
import { ReleaseStager } from "@session-manager/application/patches/follow/ReleaseStager"
import { FollowUseCase } from "@session-manager/application/patches/FollowUseCase"
import { InstallationCatalog } from "@session-manager/application/patches/InstallationCatalog"
import { FollowRollbackUseCase } from "@session-manager/application/patches/FollowRollbackUseCase"
import type { InstalledCopy } from "@session-manager/domain/model/patches/Installation"
import type { PatchDefinition } from "@session-manager/domain/model/patches/Patch"
import type { EvidencePort } from "@session-manager/domain/ports/outbound/EvidencePort"
import type { ManagedStorePort } from "@session-manager/domain/ports/outbound/ManagedStorePort"
import type { InstalledPackage, PackageInstallerPort } from "@session-manager/domain/ports/outbound/PackageInstallerPort"
import type { PublishedVersion, RegistryPort } from "@session-manager/domain/ports/outbound/RegistryPort"
import type { SandboxPort, SandboxProof } from "@session-manager/domain/ports/outbound/SandboxPort"
import type { FollowLockPort } from "@session-manager/domain/ports/outbound/FollowLockPort"
import type { LivePlugin, LivePluginsPort } from "@session-manager/domain/ports/outbound/LivePluginsPort"
import type { TranspilePort } from "@session-manager/domain/ports/outbound/TranspilePort"
import { magicContextEntry, MAGIC_CONTEXT_PACKAGE } from "@session-manager/domain/services/Jsonc"
import {
  decode,
  encode,
  FakeAudit,
  FakeBackups,
  FakeClock,
  FakeDerived,
  FakeFiles,
  FakeHash,
  FakeInstallations,
  FakeKeyValue,
  FakeNotifier,
  FakeText,
  sha,
} from "@test/support/patches/fakes"

export const INSTALLS = "/data/installs"
export const CONFIG = "/config/opencode/opencode.jsonc"
export const TUI = CONFIG.replace(/[^/]+$/, "tui.jsonc")
export const NPM_ENTRY = `${MAGIC_CONTEXT_PACKAGE}@1.0.0`
export const configText = (entry: string) => `{\n  // the plugins\n  "plugins": [\n    "${entry}", // Magic Context\n  ],\n}\n`
export const rootOf = (version: string) => `${INSTALLS}/${version}/node_modules/${MAGIC_CONTEXT_PACKAGE}`

/** A package release with two files holding the site once each, and one file without it. */
export const RELEASE_FILES: Record<string, string> = {
  "dist/a.js": "const site = 1; OLD;\n",
  "dist/v2/b.js": "const site = 2; OLD;\n",
  "dist/c.js": "nothing here\n",
}
export const published = (version = "2.0.0"): PublishedVersion => ({ version, integrity: `sha512-${version}` })

/** A patch whose matcher finds `OLD` once in two files, right after `site`. */
export const followPatch: PatchDefinition = {
  id: "follow-patch",
  title: "a patch for follow",
  reason: "testing",
  evidence: "docs/reference/x.md",
  releases: [],
  matcher: { directory: "dist", extension: ".js", sites: [{ name: "old", files: 2, shapes: [{ find: "OLD", replace: "NEW", count: 1 }], anchor: "site", window: 20 }] },
}

/** The same patch, reviewed for 2.0.0 with the checksums the matcher derives. */
export const reviewedPatch = (after = (text: string) => text.replace("OLD", "NEW")): PatchDefinition => ({
  ...followPatch,
  releases: [
    {
      version: "2.0.0",
      files: ["dist/a.js", "dist/v2/b.js"].map((path) => ({
        path,
        before: sha(RELEASE_FILES[path]!),
        after: sha(after(RELEASE_FILES[path]!)),
        replacements: [{ find: "OLD", replace: "NEW", count: 1 }],
      })),
    },
  ],
})

export class FakeRegistry implements RegistryPort {
  constructor(
    public latestVersion: PublishedVersion | Error = published(),
    public known: PublishedVersion[] = [published(), published("1.0.0")],
  ) {}
  async latest(): Promise<PublishedVersion> {
    if (this.latestVersion instanceof Error) throw this.latestVersion
    return this.latestVersion
  }
  async find(version: string): Promise<PublishedVersion | null> {
    return this.known.find((entry) => entry.version === version) ?? null
  }
}

/** Installs RELEASE_FILES (or `files`) into the folder of a FakeFiles, as Arborist would lay them out. */
export class FakeInstaller implements PackageInstallerPort {
  readonly installed: string[] = []
  constructor(
    private readonly files: FakeFiles,
    public override: Partial<InstalledPackage> | Error = {},
    public contents: Record<string, string> = RELEASE_FILES,
  ) {}
  async install(spec: string, folder: string): Promise<InstalledPackage> {
    this.installed.push(spec)
    if (this.override instanceof Error) throw this.override
    const root = `${folder}/node_modules/${MAGIC_CONTEXT_PACKAGE}`
    for (const [file, text] of Object.entries(this.contents)) this.files.contents.set(`${root}/${file}`, encode(text))
    const version = spec.slice(MAGIC_CONTEXT_PACKAGE.length + 1)
    return { root, version, integrity: `sha512-${version}`, ...this.override }
  }
}

/** Install folders kept as path prefixes of a FakeFiles. */
export class FakeStore implements ManagedStorePort {
  readonly removed: string[] = []
  private count = 0
  constructor(
    private readonly files: FakeFiles,
    public publishFails = false,
  ) {}
  private under = (folder: string) => [...this.files.contents.keys()].filter((key) => key.startsWith(`${folder}/`))
  /** Marks a published folder, as an earlier run would have left it. */
  seed(version: string): void {
    this.files.contents.set(`${INSTALLS}/${version}/package.json`, encode("{}"))
  }
  async stage(version: string): Promise<string> {
    this.count += 1
    return `${INSTALLS}/.staging-${version}-${this.count}`
  }
  async published(version: string): Promise<string | null> {
    return this.under(`${INSTALLS}/${version}`).length > 0 ? `${INSTALLS}/${version}` : null
  }
  async publish(staging: string, version: string): Promise<string> {
    if (this.publishFails) throw new Error("rename failed")
    const target = `${INSTALLS}/${version}`
    for (const key of this.under(staging)) {
      this.files.contents.set(`${target}${key.slice(staging.length)}`, this.files.contents.get(key)!)
      this.files.contents.delete(key)
    }
    return target
  }
  async versions(): Promise<readonly string[]> {
    const names = [...this.files.contents.keys()].filter((key) => key.startsWith(`${INSTALLS}/`)).map((key) => key.slice(INSTALLS.length + 1).split("/")[0]!)
    return [...new Set(names)].filter((name) => !name.startsWith(".")).sort()
  }
  async remove(folder: string): Promise<void> {
    this.removed.push(folder)
    for (const key of this.under(folder)) this.files.contents.delete(key)
  }
}

export class FakeSandbox implements SandboxPort {
  readonly calls: Array<{ root: string; config: string | null }> = []
  constructor(public proof: (root: string) => SandboxProof = (root) => ({ status: "active", source: `${root}/index.js`, lines: ["[t] fine"], error: null })) {}
  async prove(root: string, config: string | null): Promise<SandboxProof> {
    this.calls.push({ root, config })
    return this.proof(root)
  }
}

export class FakeTranspile implements TranspilePort {
  error(code: string): string | null {
    return code.includes("SYNTAX") ? "Unexpected token" : null
  }
}

/**
 * A running OpenCode server with `locations` locations: each loads whatever opencode.jsonc names
 * (folder entries as `<folder>/index.js`), unless `answer` says otherwise.
 */
export class FakeLive implements LivePluginsPort {
  calls = 0
  constructor(
    private readonly files: FakeFiles,
    public locations = 2,
    public answer: ((entry: string | null, call: number) => readonly LivePlugin[] | null) | null = null,
  ) {}
  async magicContext(): Promise<readonly LivePlugin[] | null> {
    this.calls += 1
    const entry = magicContextEntry(this.files.text(CONFIG) ?? "")
    if (this.answer !== null) return this.answer(entry, this.calls)
    const source = entry === null ? null : entry.startsWith("/") ? `${entry}/index.js` : entry
    return Array.from({ length: this.locations }, (_, i) => ({ directory: `/work/${i}`, source, status: "active" }))
  }
}

export class FakeEvidence implements EvidencePort {
  readonly written = new Map<string, string>()
  async write(name: string, content: string): Promise<string> {
    this.written.set(name, content)
    return `/state/evidence/${name}`
  }
}

export class FakeLock implements FollowLockPort {
  released = 0
  constructor(public held = false) {}
  async acquire(): Promise<(() => Promise<void>) | null> {
    if (this.held) return null
    return async () => {
      this.released += 1
    }
  }
}

export interface FollowWorldOptions {
  readonly patches?: readonly PatchDefinition[]
  readonly entry?: string | null
  readonly copies?: InstalledCopy[]
  readonly log?: string | null
  readonly magicContextConfig?: string | null
}

/** follow and rollback wired to fakes: OpenCode pins 1.0.0 (installed), npm latest is 2.0.0. */
export function followWorld(options: FollowWorldOptions = {}) {
  const entry = options.entry === undefined ? NPM_ENTRY : options.entry
  const files = new FakeFiles(entry === null ? {} : { [CONFIG]: configText(entry) })
  const hash = new FakeHash()
  const clock = new FakeClock()
  const audit = new FakeAudit()
  const backups = new FakeBackups()
  const derived = new FakeDerived()
  const store = new FakeKeyValue()
  const notifier = new FakeNotifier()
  const evidence = new FakeEvidence()
  const lock = new FakeLock()
  const registry = new FakeRegistry()
  const managed = new FakeStore(files)
  const installer = new FakeInstaller(files)
  const sandbox = new FakeSandbox()
  const live = new FakeLive(files)
  const log = new FakeText(options.log === undefined ? "" : options.log, "/tmp/mc.log")
  const magicContextConfig = new FakeText(options.magicContextConfig === undefined ? '{ "execute_threshold_percentage": 13 }' : options.magicContextConfig, "/config/mc.jsonc")
  const patches = options.patches ?? [followPatch]
  const installations = new FakeInstallations(options.copies ?? [{ spec: "1.0.0", root: "/cache/mc@1.0.0", version: "1.0.0" }])
  const catalog = new InstallationCatalog(installations, { location: () => CONFIG, read: async () => files.text(CONFIG) ?? null }, patches)
  const editor = new PluginEntryEditor(files, hash, backups, CONFIG, "opencode.jsonc")
  const tuiEditor = new PluginEntryEditor(files, hash, backups, TUI, "tui.jsonc")
  const entries = new ConfigEntrySet(files, editor, tuiEditor)
  const switcher = new EntrySwitcher(entries, live, log, magicContextConfig, clock, { timeoutMs: 10_000, pollMs: 1_000, settleMs: 500 })
  const recorder = new AdoptionRecorder(derived, evidence, audit, notifier, store, clock, CONFIG, TUI)
  const stager = new ReleaseStager(managed, installer, files, hash, new FakeTranspile(), patches)
  const prover = new ReleaseProver(sandbox, magicContextConfig)
  const follow = new FollowUseCase(lock, catalog, registry, managed, stager, prover, switcher, live, recorder, audit, clock)
  const rollback = new FollowRollbackUseCase(lock, switcher, store, recorder, audit, clock, files)
  const entryNow = () => magicContextEntry(files.text(CONFIG) ?? "")
  return {
    files, hash, clock, audit, backups, derived, store, notifier, evidence, lock, registry, managed, installer, sandbox, live, log, entries, tuiEditor,
    magicContextConfig, installations, catalog, editor, switcher, recorder, stager, prover, follow, rollback, entryNow,
    text: (file: string) => decode(files.contents.get(file)!),
  }
}
