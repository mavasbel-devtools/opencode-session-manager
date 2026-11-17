/** Which file a backup holds: identified by version, patch, path and the checksum of its content. */
export interface BackupKey {
  readonly version: string
  readonly patch: string
  readonly path: string
  readonly sha: string
}

/** Copies of files taken before they are changed. */
export interface BackupPort {
  /** Stores the bytes (once per key) and returns where. */
  save(key: BackupKey, bytes: Uint8Array): Promise<string>
  /** The stored bytes for the key, or `null`. */
  find(key: BackupKey): Promise<Uint8Array | null>
}
