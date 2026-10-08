/** The ambient values the tool takes from its runtime: identity, time, and the OS directories. */
export interface RuntimePort {
  /** The current process id, used to name the Windows lock probe file. */
  pid(): number
  /** The `process.platform` value, which selects the operating-system adapters. */
  platform(): string
  /** Milliseconds since the epoch, for the timing fields of the report. */
  now(): number
  /** `YYYY-MM-DD-HH-MM-SS`, used to name targets, reports and backups. */
  stamp(): string
  temporaryDirectory(): string
  homeDirectory(): string
}
