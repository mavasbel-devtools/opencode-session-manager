/** A published version of the package and the integrity of its tarball. */
export interface PublishedVersion {
  readonly version: string
  readonly integrity: string
}

/** The npm registry. */
export interface RegistryPort {
  /** The version `dist-tags.latest` names. */
  latest(): Promise<PublishedVersion>
  /** A given version, or `null` when it was never published. */
  find(version: string): Promise<PublishedVersion | null>
}
