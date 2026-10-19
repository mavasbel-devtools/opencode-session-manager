import type { SessionSummary } from "@session-manager/domain/model/Session"
import { expandHome } from "@session-manager/domain/model/Paths"
import type { DirectoryListingPort } from "@session-manager/domain/ports/outbound/DirectoryListingPort"
import type { FileSystemPort } from "@session-manager/domain/ports/outbound/FileSystemPort"
import type { HomeDirectoryPort } from "@session-manager/domain/ports/outbound/HomeDirectoryPort"
import type { SessionHostPort } from "@session-manager/domain/ports/outbound/SessionHostPort"

export class FakeFileSystemAdapter implements FileSystemPort {
  public ensured: string[] = []
  public directories = new Set<string>()

  isDirectory(directory: string): boolean {
    return this.directories.has(directory)
  }

  ensureDirectory(directory: string): void {
    this.ensured.push(directory)
  }

  canonical(directory: string, home: string): string {
    return expandHome(directory, home)
  }
}

export class FakeSessionHostAdapter implements SessionHostPort {
  public sessions: SessionSummary[] = []
  public directories: string[] = []
  public moves: Array<{ sessionId: string; directory: string }> = []
  public moveError: Error | undefined

  async listSessions(): Promise<SessionSummary[]> {
    return this.sessions
  }

  async listRecentDirectories(): Promise<string[]> {
    return this.directories
  }

  async moveSession(sessionId: string, directory: string): Promise<void> {
    if (this.moveError) throw this.moveError
    this.moves.push({ sessionId, directory })
  }
}

export class FakeHomeDirectoryAdapter implements HomeDirectoryPort {
  constructor(public home: string = "/home/user") {}

  homeDirectory(): string {
    return this.home
  }
}

/** Folders in memory: every path listed is a directory, and so is every parent of one. */
export class FakeDirectoryListingAdapter implements DirectoryListingPort {
  private readonly folders = new Set<string>()

  constructor(folders: readonly string[] = []) {
    for (const folder of folders) this.add(folder)
  }

  add(folder: string): void {
    const parts = folder.split("/")
    for (let index = 1; index <= parts.length; index++) this.folders.add(parts.slice(0, index).join("/") || "/")
  }

  isDirectory(path: string): boolean {
    return this.folders.has(path)
  }

  subdirectories(directory: string): string[] {
    const prefix = directory.endsWith("/") ? directory : `${directory}/`
    return [...this.folders].filter((folder) => folder.startsWith(prefix) && folder.length > prefix.length && !folder.slice(prefix.length).includes("/")).map((folder) => folder.slice(prefix.length))
  }
}
