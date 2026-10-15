import type { MoveResult } from "@session-manager/domain/model/Session"
import { SessionNotFoundError } from "@session-manager/domain/errors/SessionNotFoundError"
import type { MoveSessionPort } from "@session-manager/domain/ports/inbound/MoveSessionPort"
import type { FileSystemPort } from "@session-manager/domain/ports/outbound/FileSystemPort"
import type { SessionHostPort } from "@session-manager/domain/ports/outbound/SessionHostPort"

/**
 * OpenCode 2 transfer: the host's `session.move` already re-resolves the
 * destination project (cross-project moves included) and tells the agent
 * about the new working directory, but it rejects a destination that does not
 * exist. This use case adds the one missing piece — creating the folder — and
 * then delegates the move to the host. The folder comes from the folder browser,
 * which only ever chooses a listed, absolute folder.
 */
export class MoveSessionUseCase implements MoveSessionPort {
  constructor(
    private readonly host: SessionHostPort,
    private readonly fs: FileSystemPort,
  ) {}

  async execute(sessionId: string, targetDirectory: string, home: string): Promise<MoveResult> {
    if (!sessionId.trim()) throw new SessionNotFoundError(sessionId)
    const directory = this.fs.canonical(targetDirectory.trim(), home)
    this.fs.ensureDirectory(directory)
    await this.host.moveSession(sessionId, directory)
    return { sessionId, newDirectory: directory }
  }
}
