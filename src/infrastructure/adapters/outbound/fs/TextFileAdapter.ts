import { readFile } from "node:fs/promises"
import type { TextSourcePort } from "@session-manager/domain/ports/outbound/TextSourcePort"
import type { LogPort } from "@session-manager/domain/ports/outbound/LogPort"

/** A text file read whole: a configuration file, or Magic Context's log split into lines. */
export class TextFileAdapter implements TextSourcePort, LogPort {
  constructor(private readonly file: string) {}

  location(): string {
    return this.file
  }

  async read(): Promise<string | null> {
    try {
      return await readFile(this.file, "utf8")
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null
      throw error
    }
  }

  async lines(): Promise<readonly string[] | null> {
    const text = await this.read()
    return text === null ? null : text.split("\n")
  }
}
