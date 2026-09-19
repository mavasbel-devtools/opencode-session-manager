import type { SessionDbPort, ListRecentDirectoriesPort } from "@transfer/domain/ports"

export class ListRecentDirectoriesUseCase implements ListRecentDirectoriesPort {
  constructor(private readonly db: SessionDbPort) {}

  async execute(): Promise<string[]> {
    const dirs = await this.db.listRecentDirectories()
    return Array.from(new Set(dirs.filter((d) => Boolean(d && d.trim()))))
  }
}
