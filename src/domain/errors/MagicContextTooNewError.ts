export class MagicContextTooNewError extends Error {
  /** A store written by a newer Magic Context than the one installed here cannot be read safely. */
  constructor(path: string, format: number, latest: number, version: string) {
    super(`${path} has Magic Context format ${format}, newer than ${latest} (Magic Context ${version} installed here); update Magic Context first`)
    this.name = "MagicContextTooNewError"
  }
}
