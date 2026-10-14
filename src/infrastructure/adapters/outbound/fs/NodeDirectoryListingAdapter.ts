import fs from "node:fs"
import path from "node:path"
import type { DirectoryListingPort } from "@session-manager/domain/ports/outbound/DirectoryListingPort"

/** Reads folders for the folder browser; a folder it cannot read lists nothing. */
export class NodeDirectoryListingAdapter implements DirectoryListingPort {
  constructor() {}

  isDirectory(target: string): boolean {
    try {
      return fs.statSync(target).isDirectory()
    } catch {
      return false
    }
  }

  subdirectories(directory: string): string[] {
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true })
    } catch {
      return []
    }
    return entries
      .filter((entry) => entry.isDirectory() || (entry.isSymbolicLink() && this.isDirectory(path.join(directory, entry.name))))
      .map((entry) => entry.name)
  }
}
