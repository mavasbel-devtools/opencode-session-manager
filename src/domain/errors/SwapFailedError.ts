export class SwapFailedError extends Error {
  constructor(message: string) {
    super(`swap failed and the original files were restored: ${message}`)
    this.name = "SwapFailedError"
  }
}
