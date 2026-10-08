export class ProfileUnreadableError extends Error {
  /** A store exists but cannot be read; `cause` is what the store reported. */
  constructor(path: string, cause: string) {
    super(`cannot read ${path}: ${cause}`)
    this.name = "ProfileUnreadableError"
  }
}
