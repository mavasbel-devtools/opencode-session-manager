import type { MaintenanceFileSystemPort } from "@session-manager/domain/ports/outbound/MaintenanceFileSystemPort"

/** In-memory file system: enough for every use case, including a rename that fails on demand. */
export class FakeFileSystem implements MaintenanceFileSystemPort {
  private readonly files = new Map<string, string>()
  private readonly directories = new Set<string>()

  public free = 1_000_000
  public readonly renames: Array<{ from: string; to: string }> = []
  /** Throw once, for a rename whose source equals this path. */
  public failRenameFrom: string | null = null
  public failRenameCode = "EBUSY"

  add(path: string, content = "content"): void {
    this.files.set(path, content)
  }

  has(path: string): boolean {
    return this.files.has(path) || this.directories.has(path)
  }

  exists(path: string): boolean {
    return this.has(path)
  }

  size(path: string): number {
    return (this.files.get(path) ?? "").length
  }

  freeBytes(): number {
    return this.free
  }

  rename(from: string, to: string): void {
    this.renames.push({ from, to })
    if (this.failRenameFrom === from) {
      this.failRenameFrom = null
      const error = new Error(`${this.failRenameCode}: ${from}`) as Error & { code: string }
      error.code = this.failRenameCode
      throw error
    }
    const content = this.files.get(from)
    if (content === undefined) throw new Error(`ENOENT: ${from}`)
    this.files.delete(from)
    this.files.set(to, content)
  }

  mkdirp(directory: string): void {
    this.directories.add(directory)
  }

  remove(path: string): void {
    this.files.delete(path)
  }

  removeDirectory(directory: string): void {
    const prefix = `${directory}/`
    if ([...this.files.keys()].some((file) => file.startsWith(prefix))) throw new Error(`ENOTEMPTY: ${directory}`)
    this.directories.delete(directory)
  }
}
