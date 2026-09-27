/** The file operations this tool needs. No path is ever written without an explicit call here. */
export interface FileSystemPort {
  exists(path: string): boolean
  size(path: string): number
  /** Free bytes on the volume that holds `directory`. */
  freeBytes(directory: string): number
  rename(from: string, to: string): void
  mkdirp(directory: string): void
  remove(path: string): void
}
