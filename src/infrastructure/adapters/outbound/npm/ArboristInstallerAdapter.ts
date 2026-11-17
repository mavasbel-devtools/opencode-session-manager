import Arborist from "@npmcli/arborist"
import { realpathSync } from "node:fs"
import path from "node:path"
import type { InstalledPackage, PackageInstallerPort } from "@session-manager/domain/ports/outbound/PackageInstallerPort"
import { MAGIC_CONTEXT_PACKAGE } from "@session-manager/domain/services/Jsonc"

/**
 * Installs with @npmcli/arborist 9.4.0 and the options OpenCode 2.1.1 passes
 * (packages/util/src/npm.ts: `binLinks: true`, `progress: false`, `savePrefix: ""`,
 * `ignoreScripts: true`, `audit: false`; reify with `save: true`, `saveType: "prod"`), which
 * reproduces OpenCode's own install byte for byte (8,410 files for 0.49.19). The npm CLI does not:
 * it leaves out optional packages.
 */
export class ArboristInstallerAdapter implements PackageInstallerPort {
  constructor(
    private readonly registry: string,
    private readonly cache: string,
  ) {}

  async install(spec: string, folder: string): Promise<InstalledPackage> {
    // Arborist drops every edge when `path` names the same folder through a symlink (for example the
    // `/var/…` form of a staging folder under `$TMPDIR`, whose real path is `/private/var/…`), so stage
    // through the real path and resolve the installed root from it.
    const realFolder = realpathSync(folder)
    const options = { registry: this.registry, cache: this.cache, audit: false }
    const arborist = new Arborist({ ...options, path: realFolder, binLinks: true, progress: false, savePrefix: "", ignoreScripts: true })
    const tree = await arborist.reify({ ...options, add: [spec], save: true, saveType: "prod" } as Arborist.ReifyOptions)
    const node = tree.edgesOut.get(MAGIC_CONTEXT_PACKAGE)?.to
    if (!node) throw new Error(`Arborist installed no ${MAGIC_CONTEXT_PACKAGE} for ${spec}`)
    return { root: path.join(realFolder, "node_modules", MAGIC_CONTEXT_PACKAGE), version: node.version, integrity: node.integrity ?? null }
  }
}
