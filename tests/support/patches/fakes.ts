import { createHash } from "node:crypto"
import type { InstalledCopy } from "@session-manager/domain/model/patches/Installation"
import type { DerivedRelease, PatchDefinition } from "@session-manager/domain/model/patches/Patch"
import type { AuditLogPort, AuditRecord } from "@session-manager/domain/ports/outbound/AuditLogPort"
import type { BackupKey, BackupPort } from "@session-manager/domain/ports/outbound/BackupPort"
import type { DerivedReleasesPort } from "@session-manager/domain/ports/outbound/DerivedReleasesPort"
import type { FilesPort } from "@session-manager/domain/ports/outbound/FilesPort"
import type { HashPort } from "@session-manager/domain/ports/outbound/HashPort"
import type { InstallationsPort } from "@session-manager/domain/ports/outbound/InstallationsPort"
import type { ClockPort } from "@session-manager/domain/ports/outbound/ClockPort"
import type { KeyValuePort } from "@session-manager/domain/ports/outbound/KeyValuePort"
import type { LogPort } from "@session-manager/domain/ports/outbound/LogPort"
import type { NotifierPort } from "@session-manager/domain/ports/outbound/NotifierPort"
import type { ServicePort } from "@session-manager/domain/ports/outbound/ServicePort"
import type { TextSourcePort } from "@session-manager/domain/ports/outbound/TextSourcePort"

export const encode = (text: string) => new TextEncoder().encode(text)
export const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes)
export const sha = (text: string | Uint8Array) => createHash("sha256").update(text).digest("hex")

export class FakeHash implements HashPort {
  sha256(bytes: Uint8Array): string {
    return sha(bytes)
  }
}

/** Files in memory, with failures to inject: a replace that throws, or one that writes other bytes. */
export class FakeFiles implements FilesPort {
  readonly contents = new Map<string, Uint8Array>()
  readonly failReplace = new Set<string>()
  readonly corruptReplace = new Set<string>()
  replaces: string[] = []

  constructor(files: Record<string, string> = {}) {
    for (const [file, text] of Object.entries(files)) this.contents.set(file, encode(text))
  }

  text(file: string): string | undefined {
    const bytes = this.contents.get(file)
    return bytes === undefined ? undefined : decode(bytes)
  }

  async read(file: string): Promise<Uint8Array | null> {
    return this.contents.get(file) ?? null
  }

  async replace(file: string, bytes: Uint8Array): Promise<void> {
    this.replaces.push(file)
    if (this.failReplace.has(file)) throw new Error(`cannot write ${file}`)
    this.contents.set(file, this.corruptReplace.has(file) ? encode("corrupted") : bytes)
  }

  async list(directory: string, extension: string): Promise<readonly string[]> {
    return [...this.contents.keys()]
      .filter((file) => file.startsWith(`${directory}/`) && file.endsWith(extension))
      .map((file) => file.slice(directory.length + 1))
      .sort()
  }
}

export class FakeInstallations implements InstallationsPort {
  constructor(public copies: InstalledCopy[]) {}
  async list(): Promise<readonly InstalledCopy[]> {
    return this.copies
  }
}

export class FakeText implements TextSourcePort, LogPort {
  constructor(
    public text: string | null,
    private readonly where = "/fake/config.jsonc",
  ) {}
  location(): string {
    return this.where
  }
  async read(): Promise<string | null> {
    return this.text
  }
  async lines(): Promise<readonly string[] | null> {
    return this.text === null ? null : this.text.split("\n")
  }
}

export class FakeBackups implements BackupPort {
  readonly stored = new Map<string, Uint8Array>()
  private id = (key: BackupKey) => `${key.version}/${key.patch}/${key.path}@${key.sha}`
  async save(key: BackupKey, bytes: Uint8Array): Promise<string> {
    this.stored.set(this.id(key), bytes)
    return `/backups/${this.id(key)}`
  }
  async find(key: BackupKey): Promise<Uint8Array | null> {
    return this.stored.get(this.id(key)) ?? null
  }
}

export class FakeAudit implements AuditLogPort {
  readonly records: AuditRecord[] = []
  location(): string {
    return "/state/audit.log"
  }
  async append(record: AuditRecord): Promise<void> {
    this.records.push(record)
  }
}

/** A clock that stands still until slept on: each sleep moves it forward by exactly that much. */
export class FakeClock implements ClockPort {
  readonly slept: number[] = []
  constructor(public at = Date.parse("2026-10-11T12:00:00Z")) {}
  now(): number {
    return this.at
  }
  async sleep(ms: number): Promise<void> {
    this.slept.push(ms)
    this.at += ms
  }
}

export class FakeNotifier implements NotifierPort {
  readonly sent: Array<{ title: string; body: string }> = []
  async notify(title: string, body: string): Promise<void> {
    this.sent.push({ title, body })
  }
}

export class FakeService implements ServicePort {
  constructor(private readonly at: number | null) {}
  async startedAt(): Promise<number | null> {
    return this.at
  }
}

export class FakeKeyValue implements KeyValuePort {
  readonly values = new Map<string, string>()
  async get(key: string): Promise<string | null> {
    return this.values.get(key) ?? null
  }
  async set(key: string, value: string | null): Promise<void> {
    if (value === null) this.values.delete(key)
    else this.values.set(key, value)
  }
}

/** A small package and a patch for it, checksums computed from the texts. */
export const ROOT = "/cache/mc@1.0.0/node_modules/@cortexkit/opencode-magic-context"
export const ORIGINAL_A = 'a: min(20).max(90) b: min(20).max(90)\n'
export const PATCHED_A = 'a: min(1).max(90) b: min(1).max(90)\n'
export const ORIGINAL_B = 'only min(20).max(90) here\n'
export const PATCHED_B = 'only min(1).max(90) here\n'

export const replacement = (count: number) => ({ find: "min(20).max(90", replace: "min(1).max(90", count })

export const smallPatch: PatchDefinition = {
  id: "small",
  title: "small patch",
  reason: "testing",
  evidence: "docs/reference/x.md",
  releases: [
    {
      version: "1.0.0",
      files: [
        { path: "dist/a.js", before: sha(ORIGINAL_A), after: sha(PATCHED_A), replacements: [replacement(2)] },
        { path: "dist/b.js", before: sha(ORIGINAL_B), after: sha(PATCHED_B), replacements: [replacement(1)] },
      ],
    },
    { version: "0.9.0", files: [] },
  ],
  matcher: { directory: "dist", extension: ".js", sites: [{ name: "only", files: 1, shapes: [{ find: "only min(20).max(90", replace: "only min(1).max(90", count: 1 }], anchor: "only", window: 10 }] },
}

export const copy = (version = "1.0.0", spec = version, root = ROOT): InstalledCopy => ({ spec, root, version })
export const PINNED_PLUGIN_CONFIG = '{ "plugins": ["@cortexkit/opencode-magic-context@1.0.0"] }'

export class FakeDerived implements DerivedReleasesPort {
  constructor(public releases: DerivedRelease[] = []) {}
  async list(): Promise<readonly DerivedRelease[]> {
    return this.releases
  }
  async save(release: DerivedRelease): Promise<void> {
    this.releases = [...this.releases.filter((r) => r.patch !== release.patch || r.release.version !== release.release.version), release]
  }
}
