/** The installed package's files. */
export interface FilesPort {
  /** The file's bytes, or `null` when it does not exist. */
  read(path: string): Promise<Uint8Array | null>
  /** Replaces the file in one step (written beside it, then renamed over it), keeping its mode. */
  replace(path: string, bytes: Uint8Array): Promise<void>
  /** Every file under `directory` whose name ends with `extension`, as paths relative to it. */
  list(directory: string, extension: string): Promise<readonly string[]>
}
