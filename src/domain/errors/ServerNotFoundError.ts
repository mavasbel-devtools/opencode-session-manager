/** No OpenCode server to send a command to: none is recorded and none was named. */
export class ServerNotFoundError extends Error {
  readonly _tag = "ServerNotFoundError"

  constructor(readonly searched: string) {
    super(`no running OpenCode server found (looked for ${searched}); start OpenCode, or name it with --server <url>`)
    this.name = "ServerNotFoundError"
  }
}
