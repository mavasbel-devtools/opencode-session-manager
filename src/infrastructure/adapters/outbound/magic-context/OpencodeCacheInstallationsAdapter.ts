import { readdir, readFile } from "node:fs/promises"
import path from "node:path"
import type { InstalledCopy } from "@session-manager/domain/model/patches/Installation"
import type { InstallationsPort } from "@session-manager/domain/ports/outbound/InstallationsPort"
import { MAGIC_CONTEXT_PACKAGE } from "@session-manager/domain/services/Jsonc"

const FOLDER_PREFIX = "opencode-magic-context@"
const PACKAGE_PATH = ["node_modules", "@cortexkit", "opencode-magic-context"]

async function directories(directory: string): Promise<string[]> {
  try {
    return (await readdir(directory, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name).sort()
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return []
    throw error
  }
}

async function packageVersion(root: string): Promise<string | null> {
  try {
    const manifest = JSON.parse(await readFile(path.join(root, "package.json"), "utf8")) as { name?: unknown; version?: unknown }
    return manifest.name === MAGIC_CONTEXT_PACKAGE && typeof manifest.version === "string" ? manifest.version : null
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null
    throw error
  }
}

/**
 * OpenCode installs each plugin spec into `<cache>/opencode-magic-context@<spec>/` with the package
 * under `node_modules/@cortexkit/opencode-magic-context`, directly or one folder further down
 * (OpenCode 2.0.24 uses a numbered folder: `@0.47.0/1791693075785/node_modules/...`).
 */
export class OpencodeCacheInstallationsAdapter implements InstallationsPort {
  constructor(private readonly cacheDirectory: string) {}

  async list(): Promise<readonly InstalledCopy[]> {
    const copies: InstalledCopy[] = []
    for (const folder of await directories(this.cacheDirectory)) {
      if (!folder.startsWith(FOLDER_PREFIX)) continue
      const base = path.join(this.cacheDirectory, folder)
      const candidates = [base, ...(await directories(base)).map((sub) => path.join(base, sub))]
      for (const candidate of candidates) {
        const root = path.join(candidate, ...PACKAGE_PATH)
        const version = await packageVersion(root)
        if (version !== null) copies.push({ spec: folder.slice(FOLDER_PREFIX.length), root, version })
      }
    }
    return copies
  }
}
