/** One copy of the package that OpenCode installed under its npm cache. */
export interface InstalledCopy {
  /** What OpenCode installed it for: the part after `@` in the plugin entry (`0.47.0`, `latest`). */
  readonly spec: string
  /** Absolute path of the package root (the folder holding its package.json). */
  readonly root: string
  readonly version: string
}

/** An installed copy, and whether it is the one the OpenCode configuration pins. */
export interface Installation extends InstalledCopy {
  readonly loaded: boolean
}
