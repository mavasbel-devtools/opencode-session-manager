/** What one location of the running OpenCode server reports about the Magic Context plugin. */
export interface LivePlugin {
  readonly directory: string
  /** The folder it is loaded from (`local`), or the npm spec (`package`); null when it is not listed. */
  readonly source: string | null
  readonly status: string | null
}

/** The plugins of the running OpenCode server, location by location. */
export interface LivePluginsPort {
  /** One entry per loaded location; `null` when no server answers. */
  magicContext(): Promise<readonly LivePlugin[] | null>
}
