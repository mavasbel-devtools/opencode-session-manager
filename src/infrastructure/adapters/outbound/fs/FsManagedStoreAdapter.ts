import { randomUUID } from "node:crypto"
import { mkdir, readdir, rename, rm, stat } from "node:fs/promises"
import path from "node:path"
import type { ManagedStorePort } from "@session-manager/domain/ports/outbound/ManagedStorePort"

const STAGING = ".staging-"

/** `<installs>/<version>/` folders, and `.staging-<version>-<uuid>/` folders beside them while a run works. */
export class FsManagedStoreAdapter implements ManagedStorePort {
  constructor(private readonly installs: string) {}

  async stage(version: string): Promise<string> {
    const folder = path.join(this.installs, `${STAGING}${version}-${randomUUID()}`)
    await mkdir(folder, { recursive: true })
    return folder
  }

  async published(version: string): Promise<string | null> {
    const folder = path.join(this.installs, version)
    return (await stat(folder).catch(() => null))?.isDirectory() ? folder : null
  }

  async publish(staging: string, version: string): Promise<string> {
    const folder = path.join(this.installs, version)
    if ((await this.published(version)) !== null) throw new Error(`${folder} already exists`)
    await rename(staging, folder)
    return folder
  }

  /** Every published version; the folder exists by then, since only a run that published one asks. */
  async versions(): Promise<readonly string[]> {
    const entries = await readdir(this.installs, { withFileTypes: true })
    return entries.filter((entry) => entry.isDirectory() && !entry.name.startsWith(".")).map((entry) => entry.name).sort()
  }

  async remove(folder: string): Promise<void> {
    await rm(folder, { recursive: true, force: true })
  }
}
