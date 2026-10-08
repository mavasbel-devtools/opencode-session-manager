/** The file operations this tool needs. No path is ever written without an explicit call here. */
export interface MaintenanceFileSystemPort {
  exists(path: string): boolean
  size(path: string): number
  /** Free bytes on the volume that holds `directory`. */
  freeBytes(directory: string): number
  rename(from: string, to: string): void
  mkdirp(directory: string): void
  remove(path: string): void
  /** Removes a folder only if it is empty. */
  removeDirectory(directory: string): void
  /** Copies one file's bytes; the source is only read. */
  copyFile(from: string, to: string): void
  /** Removes a folder this tool created, with everything in it. */
  removeTree(directory: string): void
}
