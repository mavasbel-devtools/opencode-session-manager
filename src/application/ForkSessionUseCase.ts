import { ServerNotFoundError } from "@session-manager/domain/errors/ServerNotFoundError"
import { ServerRefusedError } from "@session-manager/domain/errors/ServerRefusedError"
import type { ForkReport } from "@session-manager/domain/model/Fork"
import type { ForkInput, ForkSessionPort } from "@session-manager/domain/ports/inbound/ForkSessionPort"
import type { OpencodeServerPort } from "@session-manager/domain/ports/outbound/OpencodeServerPort"

/**
 * Forks a session through the OpenCode server (OpenCode's own fork: new ids, ` (fork #n)` title,
 * the settled messages copied). Writes nothing itself; Magic Context (0.47 on) gives the fork its
 * parent's state when the first prompt is sent in it.
 */
export class ForkSessionUseCase implements ForkSessionPort {
  constructor(private readonly server: OpencodeServerPort) {}

  async fork(input: ForkInput): Promise<ForkReport> {
    const recorded = this.server.recorded()
    const connection = input.server === null ? recorded : { url: input.server, password: recorded?.password ?? null }
    if (connection === null) throw new ServerNotFoundError(this.server.searched())
    const answer = await this.server.fork(connection, input.sessionId, input.before)
    if (!answer.ok) throw new ServerRefusedError(`fork ${input.sessionId}`, answer.status, answer.detail)
    const { session } = answer
    return { server: connection.url, parent_id: input.sessionId, fork_id: session.id, title: session.title, boundary: session.boundary, directory: session.directory }
  }
}
