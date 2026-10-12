/** The OpenCode server refused a request (or could not be reached: no status). */
export class ServerRefusedError extends Error {
  readonly _tag = "ServerRefusedError"

  constructor(
    readonly action: string,
    readonly status: number | null,
    readonly detail: string,
  ) {
    super(`the OpenCode server refused to ${action}: ${status ?? "no answer"}: ${detail}`)
    this.name = "ServerRefusedError"
  }
}
