import type { DirectoryOption } from "@transfer/domain/entities"
import { abbreviateHome } from "@transfer/domain/paths"
import type { BuildDirectoryOptionsPort, FileSystemPort, SessionDbPort } from "@transfer/domain/ports"

/**
 * Builds the flat option list shown by the transfer dialog.
 *
 * A plugin cannot drive live filesystem autocompletion from the filter box
 * (`DialogSelect` exposes neither a filter handle nor custom bindings to
 * plugins), so instead we surface every known session directory — nested
 * projects included — plus a sentinel entry that opens the free-form path
 * prompt. `DialogSelect`'s own fuzzy filter then matches the user's query
 * against the abbreviated titles.
 */
export class BuildDirectoryOptionsUseCase implements BuildDirectoryOptionsPort {
  constructor(
    private readonly db: SessionDbPort,
    private readonly fs: FileSystemPort,
  ) {}

  async execute(home: string): Promise<DirectoryOption[]> {
    const known = await this.db.listRecentDirectories()

    const directories = Array.from(
      new Set(
        known
          .filter((directory) => Boolean(directory && directory.trim()))
          .map((directory) => this.fs.canonical(directory, home)),
      ),
    ).sort((a, b) => a.localeCompare(b))

    return [
      { title: "Enter custom path…", directory: "", category: "Directories", custom: true },
      ...directories.map((directory) => ({
        title: abbreviateHome(directory, home),
        directory,
        description: directory,
        category: "Directories",
      })),
    ]
  }
}
