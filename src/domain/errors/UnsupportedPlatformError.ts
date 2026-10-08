export class UnsupportedPlatformError extends Error {
  constructor(platform: string, supported: readonly string[]) {
    super(`unsupported platform: ${platform} (supported: ${supported.join(", ")})`)
    this.name = "UnsupportedPlatformError"
  }
}
