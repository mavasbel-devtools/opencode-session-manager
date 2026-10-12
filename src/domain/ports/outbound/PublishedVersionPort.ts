/** Outbound port: the newest version of a package its registry publishes. */
export interface PublishedVersionPort {
  /** Null when the registry cannot be reached or does not answer in time. */
  latest(): Promise<string | null>
}
