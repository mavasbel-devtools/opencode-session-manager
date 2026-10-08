/** Outbound port: the user's home directory, the base of the `~` shorthand. Read on every call. */
export interface HomeDirectoryPort {
  homeDirectory(): string
}
