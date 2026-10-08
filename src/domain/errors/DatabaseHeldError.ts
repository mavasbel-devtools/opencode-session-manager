export class DatabaseHeldError extends Error {
  /** `holder` is what the platform could tell: the refusal code on Windows, the holding processes on Linux. */
  constructor(dbPath: string, holder: string) {
    super(`${dbPath} is held open by another process (${holder}); close every OpenCode process first`)
    this.name = "DatabaseHeldError"
  }
}
