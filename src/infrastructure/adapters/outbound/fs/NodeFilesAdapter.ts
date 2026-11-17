import { chmod, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises"
import path from "node:path"
import type { FilesPort } from "@session-manager/domain/ports/outbound/FilesPort"

const isMissing = (error: unknown) => (error as NodeJS.ErrnoException).code === "ENOENT"

export class NodeFilesAdapter implements FilesPort {
  constructor() {}

  async read(file: string): Promise<Uint8Array | null> {
    try {
      return new Uint8Array(await readFile(file))
    } catch (error) {
      if (isMissing(error)) return null
      throw error
    }
  }

  async replace(file: string, bytes: Uint8Array): Promise<void> {
    const { mode } = await stat(file)
    const staging = path.join(path.dirname(file), `.${path.basename(file)}.osm-patches-${process.pid}`)
    try {
      await writeFile(staging, bytes)
      await chmod(staging, mode & 0o7777)
      await rename(staging, file)
    } finally {
      await rm(staging, { force: true })
    }
  }

  async list(directory: string, extension: string): Promise<readonly string[]> {
    const entries = await readdir(directory, { recursive: true, withFileTypes: true })
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(extension))
      .map((entry) => path.relative(directory, path.join(entry.parentPath, entry.name)))
      .sort()
  }
}
