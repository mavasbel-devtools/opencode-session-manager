/** Outbound port: the filesystem operations the transfer needs. */
export interface FileSystemPort {
  /** Create the directory (and parents) when missing. */
  ensureDirectory(directory: string): void
  /** Resolve to the exact on-disk casing when the directory exists. */
  canonical(directory: string, home: string): string
}
