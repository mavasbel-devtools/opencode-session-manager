import type { PublishedVersion, RegistryPort } from "@session-manager/domain/ports/outbound/RegistryPort"
import { MAGIC_CONTEXT_PACKAGE } from "@session-manager/domain/services/Jsonc"

interface Packument {
  readonly "dist-tags"?: { readonly latest?: string }
  readonly versions?: Readonly<Record<string, { readonly dist?: { readonly integrity?: string } }>>
}

/** Magic Context's packument from an npm registry (the abbreviated form npm itself installs from). */
export class NpmPackumentAdapter implements RegistryPort {
  constructor(private readonly registry: string) {}

  private async packument(): Promise<Packument> {
    const url = `${this.registry.replace(/\/$/, "")}/${MAGIC_CONTEXT_PACKAGE.replace("/", "%2f")}`
    const response = await fetch(url, { headers: { accept: "application/vnd.npm.install-v1+json" } })
    if (!response.ok) throw new Error(`GET ${url}: HTTP ${response.status}`)
    return (await response.json()) as Packument
  }

  private static version(packument: Packument, version: string): PublishedVersion | null {
    const integrity = packument.versions?.[version]?.dist?.integrity
    return integrity === undefined ? null : { version, integrity }
  }

  async latest(): Promise<PublishedVersion> {
    const packument = await this.packument()
    const latest = packument["dist-tags"]?.latest
    const found = latest === undefined ? null : NpmPackumentAdapter.version(packument, latest)
    if (found === null) throw new Error(`the registry names no installable latest version (dist-tags.latest ${latest ?? "missing"})`)
    return found
  }

  async find(version: string): Promise<PublishedVersion | null> {
    return NpmPackumentAdapter.version(await this.packument(), version)
  }
}
