import type { TransferResult } from "@session-manager/domain/model/Session"
import { InvalidDirectoryError } from "@session-manager/domain/errors/InvalidDirectoryError"
import { SessionNotFoundError } from "@session-manager/domain/errors/SessionNotFoundError"
import type { TransferSessionPort } from "@session-manager/domain/ports/inbound/TransferSessionPort"
import type { FileSystemPort } from "@session-manager/domain/ports/outbound/FileSystemPort"
import type { ProjectResolverPort } from "@session-manager/domain/ports/outbound/ProjectResolverPort"
import type { SessionDbPort } from "@session-manager/domain/ports/outbound/SessionDbPort"

export class TransferSessionUseCase implements TransferSessionPort {
  constructor(
    private readonly db: SessionDbPort,
    private readonly resolver: ProjectResolverPort,
    private readonly fs: FileSystemPort,
  ) {}

  async execute(sessionId: string, targetDirectory: string): Promise<TransferResult> {
    if (!sessionId || !sessionId.trim()) {
      throw new SessionNotFoundError(sessionId)
    }

    const trimmedTarget = targetDirectory.trim()
    if (!trimmedTarget) {
      throw new InvalidDirectoryError(targetDirectory, "Directory path cannot be empty")
    }

    const session = await this.db.getSession(sessionId)
    if (!session) {
      throw new SessionNotFoundError(sessionId)
    }

    // Create the destination when missing (arbitrary or brand-new directories).
    this.fs.ensureDirectory(trimmedTarget)

    const resolved = await this.resolver.resolve(trimmedTarget)

    await this.db.upsertProject(resolved.projectId, resolved.worktree)

    await this.db.updateSessionLocation(
      sessionId,
      trimmedTarget,
      resolved.projectId,
      resolved.relativePath,
    )

    return {
      sessionId,
      previousDirectory: session.directory,
      newDirectory: trimmedTarget,
      newProjectId: resolved.projectId,
      newRelativePath: resolved.relativePath,
    }
  }
}
