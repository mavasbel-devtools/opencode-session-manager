/** The errors this tool raises. Messages are part of the contract: the operator relies on them. */

export class DatabaseHeldError extends Error {
  /** `holder` is what the platform could tell: the refusal code on Windows, the holding processes on Linux. */
  constructor(dbPath: string, holder: string) {
    super(`${dbPath} is held open by another process (${holder}); close every OpenCode process first`)
    this.name = "DatabaseHeldError"
  }
}

export class ProcessRunningError extends Error {
  constructor(image: string, pids: readonly number[], remedy: string) {
    super(`${image} is running (PIDs ${pids.join(", ")}); ${remedy}`)
    this.name = "ProcessRunningError"
  }
}

export class DatabaseNotFoundError extends Error {
  constructor(dbPath: string) {
    super(`database not found: ${dbPath}`)
    this.name = "DatabaseNotFoundError"
  }
}

export class InsufficientSpaceError extends Error {
  constructor(freeBytes: number, requiredBytes: number) {
    super(`not enough free disk space: ${freeBytes} B free, ${requiredBytes} B required`)
    this.name = "InsufficientSpaceError"
  }
}

export class TargetExistsError extends Error {
  constructor(target: string) {
    super(`refusing to overwrite existing ${target}`)
    this.name = "TargetExistsError"
  }
}

export class MissingOriginalError extends Error {
  constructor(backupDirectory: string) {
    super(`no original database in ${backupDirectory}`)
    this.name = "MissingOriginalError"
  }
}

export class SwapFailedError extends Error {
  constructor(message: string) {
    super(`swap failed and the original files were restored: ${message}`)
    this.name = "SwapFailedError"
  }
}

export class UnsupportedPlatformError extends Error {
  constructor(platform: string, supported: readonly string[]) {
    super(`unsupported platform: ${platform} (supported: ${supported.join(", ")})`)
    this.name = "UnsupportedPlatformError"
  }
}
