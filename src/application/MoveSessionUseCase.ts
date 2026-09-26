import type { MoveResult } from "@transfer/domain/entities"
import { InvalidDirectoryError, SessionNotFoundError } from "@transfer/domain/errors"
import type { FileSystemPort, MoveSessionPort, SessionHostPort } from "@transfer/domain/ports"

/**
 * OpenCode 2 transfer: the host's `session.move` already re-resolves the
 * destination project (cross-project moves included) and tells the agent
 * about the new working directory, but it rejects a destination that does not
 * exist. This use case adds the one missing piece — creating the folder — and
 * then delegates the move to the host.
 */
export class MoveSessionUseCase implements MoveSessionPort {
  constructor(
    private readonly host: SessionHostPort,
    private readonly fs: FileSystemPort,
  ) {}

  async execute(sessionId: string, targetDirectory: string): Promise<MoveResult> {
    if (!sessionId || !sessionId.trim()) {
      throw new SessionNotFoundError(sessionId)
    }

    const directory = targetDirectory.trim()
    if (!directory) {
      throw new InvalidDirectoryError(targetDirectory, "Directory path cannot be empty")
    }

    this.fs.ensureDirectory(directory)
    await this.host.moveSession(sessionId, directory)

    return { sessionId, newDirectory: directory }
  }
}
