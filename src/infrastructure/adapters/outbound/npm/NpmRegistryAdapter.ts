import type { PublishedVersionPort } from "@session-manager/domain/ports/outbound/PublishedVersionPort"

/** The `latest` dist-tag of one package on an npm registry, with a time limit; any failure is "no answer". */
export class NpmRegistryAdapter implements PublishedVersionPort {
  private readonly registry: string
  private readonly packageName: string
  private readonly timeoutMs: number

  constructor(registry: string, packageName: string, timeoutMs: number) {
    this.registry = registry.replace(/\/+$/, "")
    this.packageName = packageName
    this.timeoutMs = timeoutMs
  }

  async latest(): Promise<string | null> {
    try {
      const response = await fetch(`${this.registry}/${this.packageName.replace("/", "%2f")}/latest`, { signal: AbortSignal.timeout(this.timeoutMs) })
      if (!response.ok) return null
      const version = ((await response.json()) as { version?: unknown }).version
      return typeof version === "string" ? version : null
    } catch {
      return null
    }
  }
}
