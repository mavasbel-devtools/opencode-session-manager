import fs from "node:fs"
import path from "node:path"
import { expandHome } from "@session-manager/domain/model/Paths"
import type { FileSystemPort } from "@session-manager/domain/ports/outbound/FileSystemPort"

/** The only place `node:fs` is used by the transfer. */
export class NodeFileSystemAdapter implements FileSystemPort {
  constructor() {}

  isDirectory(directory: string): boolean {
    try {
      return fs.statSync(directory).isDirectory()
    } catch {
      return false
    }
  }

  ensureDirectory(directory: string): void {
    fs.mkdirSync(directory, { recursive: true })
  }

  canonical(directory: string, home: string): string {
    const expanded = path.resolve(expandHome(directory, home))
    try {
      // Bun always provides the native realpath, which recovers on-disk casing.
      const native = fs.realpathSync as unknown as { native: (input: string) => string }
      return native.native(expanded)
    } catch {
      return expanded
    }
  }
}
