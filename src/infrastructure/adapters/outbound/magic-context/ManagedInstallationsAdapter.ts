import { readdir, readFile } from "node:fs/promises"
import path from "node:path"
import type { InstalledCopy } from "@session-manager/domain/model/patches/Installation"
import type { InstallationsPort } from "@session-manager/domain/ports/outbound/InstallationsPort"
import { MAGIC_CONTEXT_PACKAGE } from "@session-manager/domain/services/Jsonc"

/**
 * The copies `follow` installed: `<installs>/<version>/node_modules/@cortexkit/opencode-magic-context`.
 * Their spec is that absolute folder, which is exactly what the opencode.jsonc entry names.
 */
export class ManagedInstallationsAdapter implements InstallationsPort {
  constructor(private readonly installs: string) {}

  async list(): Promise<readonly InstalledCopy[]> {
    const entries = await readdir(this.installs, { withFileTypes: true }).catch(() => [])
    const copies: InstalledCopy[] = []
    for (const entry of entries.filter((e) => e.isDirectory() && !e.name.startsWith(".")).sort((a, b) => a.name.localeCompare(b.name))) {
      const root = path.join(this.installs, entry.name, "node_modules", MAGIC_CONTEXT_PACKAGE)
      const manifest = await readFile(path.join(root, "package.json"), "utf8").then(
        (text) => JSON.parse(text) as { name?: unknown; version?: unknown },
        () => null,
      )
      if (manifest?.name === MAGIC_CONTEXT_PACKAGE && typeof manifest.version === "string") copies.push({ spec: root, root, version: manifest.version })
    }
    return copies
  }
}
