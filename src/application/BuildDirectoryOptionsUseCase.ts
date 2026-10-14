import type { DirectoryOption } from "@session-manager/domain/model/Session"
import { compareLabels, isFileSystemRoot } from "@session-manager/domain/model/FolderBrowser"
import { abbreviateHome } from "@session-manager/domain/model/Paths"
import type { BuildDirectoryOptionsPort } from "@session-manager/domain/ports/inbound/BuildDirectoryOptionsPort"
import type { DirectoryListingPort } from "@session-manager/domain/ports/outbound/DirectoryListingPort"
import type { FileSystemPort } from "@session-manager/domain/ports/outbound/FileSystemPort"
import type { KnownDirectoriesPort } from "@session-manager/domain/ports/outbound/KnownDirectoriesPort"

/**
 * The known folders the transfer offers: every project root, worktree and session folder, once
 * each, only those that exist (never a filesystem root), in display order (`compareLabels`),
 * after the sentinel that opens the free-form path prompt (OpenCode 1's list dialog; OpenCode 2's
 * folder browser lists the folders and takes typed paths itself).
 */
export class BuildDirectoryOptionsUseCase implements BuildDirectoryOptionsPort {
  constructor(
    private readonly db: KnownDirectoriesPort,
    private readonly fs: FileSystemPort,
    private readonly listing: DirectoryListingPort,
  ) {}

  async execute(home: string): Promise<DirectoryOption[]> {
    const known = await this.db.listRecentDirectories()
    const directories = Array.from(
      new Set(
        known
          .filter((directory) => Boolean(directory && directory.trim()))
          .map((directory) => this.fs.canonical(directory, home))
          .filter((directory) => !isFileSystemRoot(directory) && this.listing.isDirectory(directory)),
      ),
    )
      .map((directory) => ({ title: abbreviateHome(directory, home), directory, category: "Directories" }))
      .sort((left, right) => compareLabels(left.title, right.title))

    return [{ title: "Enter custom path…", directory: "", category: "Directories", custom: true }, ...directories]
  }
}
