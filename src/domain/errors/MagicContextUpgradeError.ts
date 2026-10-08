export class MagicContextUpgradeError extends Error {
  /** Magic Context's own migrations refused or failed on a store copy; the source is untouched. */
  constructor(path: string, detail: string) {
    super(`Magic Context could not upgrade ${path}: ${detail}`)
    this.name = "MagicContextUpgradeError"
  }
}
