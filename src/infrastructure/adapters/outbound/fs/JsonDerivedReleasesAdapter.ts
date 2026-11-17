import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import path from "node:path"
import type { DerivedRelease } from "@session-manager/domain/model/patches/Patch"
import type { DerivedReleasesPort } from "@session-manager/domain/ports/outbound/DerivedReleasesPort"

/** One JSON file holding every derived release; a newer one for the same patch and version replaces the older. */
export class JsonDerivedReleasesAdapter implements DerivedReleasesPort {
  constructor(private readonly file: string) {}

  async list(): Promise<readonly DerivedRelease[]> {
    try {
      return JSON.parse(await readFile(this.file, "utf8")) as DerivedRelease[]
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return []
      throw error
    }
  }

  async save(release: DerivedRelease): Promise<void> {
    const kept = (await this.list()).filter((entry) => entry.patch !== release.patch || entry.release.version !== release.release.version)
    await mkdir(path.dirname(this.file), { recursive: true })
    const staging = `${this.file}.saving-${process.pid}`
    await writeFile(staging, `${JSON.stringify([...kept, release], null, 2)}\n`)
    await rename(staging, this.file)
  }
}
