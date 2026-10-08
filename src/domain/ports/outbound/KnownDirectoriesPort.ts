/** Outbound port: the directories offered by the transfer picker. */
export interface KnownDirectoriesPort {
  listRecentDirectories(): Promise<string[]>
}
