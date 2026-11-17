/** A text file read as a whole (a configuration file); `null` when it does not exist. */
export interface TextSourcePort {
  location(): string
  read(): Promise<string | null>
}
