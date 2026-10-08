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

  async execute(sessionId: string, targetDirectory: string, home: string): Promise<TransferResult> {
    if (!sessionId.trim()) throw new SessionNotFoundError(sessionId)
    const trimmed = targetDirectory.trim()
    if (!trimmed) throw new InvalidDirectoryError(targetDirectory, "Directory path cannot be empty")

    const session = await this.db.getSession(sessionId)
    if (!session) throw new SessionNotFoundError(sessionId)

    // Create the destination when missing (arbitrary or brand-new directories).
    const directory = this.fs.canonical(trimmed, home)
    this.fs.ensureDirectory(directory)
    const resolved = await this.resolver.resolve(directory)
    await this.db.upsertProject(resolved.projectId, resolved.worktree)
    await this.db.updateSessionLocation(sessionId, directory, resolved.projectId, resolved.relativePath)

    return {
      sessionId,
      previousDirectory: session.directory,
      newDirectory: directory,
      newProjectId: resolved.projectId,
      newRelativePath: resolved.relativePath,
    }
  }
}
