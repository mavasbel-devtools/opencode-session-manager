import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import type { BackupKey, BackupPort } from "@session-manager/domain/ports/outbound/BackupPort"

/**
 * Backups addressed by content: `<root>/<version>/<patch>/<path>@<sha256>`. The same original is
 * stored once however often it is applied; the time of each backup is in the audit log.
 */
export class FsBackupAdapter implements BackupPort {
  constructor(private readonly root: string) {}

  private location(key: BackupKey): string {
    return path.join(this.root, key.version, key.patch, `${key.path}@${key.sha}`)
  }

  async save(key: BackupKey, bytes: Uint8Array): Promise<string> {
    const file = this.location(key)
    if ((await this.find(key)) === null) {
      await mkdir(path.dirname(file), { recursive: true })
      const staging = `${file}.saving-${process.pid}`
      try {
        await writeFile(staging, bytes, { mode: 0o444 })
        await rename(staging, file)
      } finally {
        await rm(staging, { force: true })
      }
    }
    return file
  }

  async find(key: BackupKey): Promise<Uint8Array | null> {
    try {
      return new Uint8Array(await readFile(this.location(key)))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null
      throw error
    }
  }
}
