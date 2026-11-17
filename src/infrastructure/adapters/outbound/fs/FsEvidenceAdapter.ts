import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import type { EvidencePort } from "@session-manager/domain/ports/outbound/EvidencePort"

/** Evidence documents, one file each, never overwritten: a name already taken gets `-2`, `-3`, … before `.md`. */
export class FsEvidenceAdapter implements EvidencePort {
  constructor(private readonly directory: string) {}

  async write(name: string, content: string): Promise<string> {
    await mkdir(this.directory, { recursive: true })
    for (let n = 1; ; n += 1) {
      const file = path.join(this.directory, n === 1 ? name : name.replace(/(\.md)?$/, `-${n}$1`))
      try {
        await writeFile(file, content, { flag: "wx" })
        return file
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error
      }
    }
  }
}
