export class InsufficientSpaceError extends Error {
  constructor(freeBytes: number, requiredBytes: number) {
    super(`not enough free disk space: ${freeBytes} B free, ${requiredBytes} B required`)
    this.name = "InsufficientSpaceError"
  }
}
