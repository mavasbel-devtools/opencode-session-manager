/** A package installed into a folder, as the installer resolved it. */
export interface InstalledPackage {
  /** Absolute path of the package root (`<folder>/node_modules/@cortexkit/opencode-magic-context`). */
  readonly root: string
  readonly version: string
  /** The tarball integrity the installer verified, or null when it reported none. */
  readonly integrity: string | null
}

/** Installs the package the way OpenCode does (Arborist 9.4.0, same options). */
export interface PackageInstallerPort {
  install(spec: string, folder: string): Promise<InstalledPackage>
}
