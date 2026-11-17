export interface HashPort {
  /** Lowercase hex sha256. */
  sha256(bytes: Uint8Array): string
}
