import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import type { MagicContextConfigPort } from "@session-manager/domain/ports/outbound/MagicContextConfigPort"
import { pinnedMagicContext } from "@session-manager/domain/services/Jsonc"
import { compareVersions } from "@session-manager/domain/services/Versions"

/**
 * Reads OpenCode's configuration (`opencode.jsonc`, else `opencode.json`, in its config folder) for
 * the Magic Context spec, and OpenCode's package cache for the copy it installed for that spec
 * (`<cache>/npm/@cortexkit/opencode-magic-context@<spec>/<stamp>/node_modules/@cortexkit/opencode-magic-context`;
 * the newest stamp's version when several are there).
 */
export class OpencodeMagicContextConfigAdapter implements MagicContextConfigPort {
  private readonly configDirectory: string
  private readonly cacheRoot: string

  constructor(configDirectory: string, cacheRoot: string) {
    this.configDirectory = configDirectory
    this.cacheRoot = cacheRoot
  }

  pinned(): string | null {
    const file = ["opencode.jsonc", "opencode.json"].map((name) => join(this.configDirectory, name)).find((path) => existsSync(path))
    return file === undefined ? null : pinnedMagicContext(readFileSync(file, "utf8"))
  }

  installed(spec: string): string | null {
    const folder = join(this.cacheRoot, "npm", "@cortexkit", `opencode-magic-context@${spec}`)
    if (!existsSync(folder)) return null
    const versions = readdirSync(folder).flatMap((stamp) => {
      try {
        const manifest = JSON.parse(readFileSync(join(folder, stamp, "node_modules", "@cortexkit", "opencode-magic-context", "package.json"), "utf8")) as { version?: unknown }
        return typeof manifest.version === "string" ? [manifest.version] : []
      } catch {
        return []
      }
    })
    return versions.sort(compareVersions).at(-1) ?? null
  }
}
