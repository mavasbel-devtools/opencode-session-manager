export class MagicContextUnavailableError extends Error {
  /** No installed Magic Context plugin was found where OpenCode keeps its plugins. */
  constructor(searched: readonly string[]) {
    super(`no installed Magic Context plugin found (searched ${searched.join(", ")}); open OpenCode once with Magic Context enabled`)
    this.name = "MagicContextUnavailableError"
  }
}
