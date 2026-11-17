import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import type { KeyValuePort } from "@session-manager/domain/ports/outbound/KeyValuePort"

/** One file per key in a directory; setting `null` deletes it. */
export class FileKeyValueAdapter implements KeyValuePort {
  constructor(private readonly directory: string) {}

  async get(key: string): Promise<string | null> {
    try {
      return await readFile(path.join(this.directory, key), "utf8")
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null
      throw error
    }
  }

  async set(key: string, value: string | null): Promise<void> {
    const file = path.join(this.directory, key)
    if (value === null) {
      await rm(file, { force: true })
      return
    }
    await mkdir(this.directory, { recursive: true })
    await writeFile(file, value)
  }
}
