/** Outbound port: what the folder browser reads from the filesystem. */
export interface DirectoryListingPort {
  /** Whether the path is a directory (a link to one counts). */
  isDirectory(path: string): boolean
  /** The names of the directories inside one (links to directories included); none when it cannot be read. */
  subdirectories(directory: string): string[]
}
