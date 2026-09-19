import { TransferSessionUseCase } from "@transfer/application/TransferSessionUseCase"
import { ListRecentDirectoriesUseCase } from "@transfer/application/ListRecentDirectoriesUseCase"
import { BuildDirectoryOptionsUseCase } from "@transfer/application/BuildDirectoryOptionsUseCase"
import { SqliteSessionDbAdapter } from "@transfer/infrastructure/adapters/outbound/sqlite/SqliteSessionDbAdapter"
import { ProjectResolverAdapter } from "@transfer/infrastructure/adapters/outbound/project/ProjectResolverAdapter"
import { DirectoryScannerAdapter } from "@transfer/infrastructure/adapters/outbound/fs/DirectoryScannerAdapter"

export interface Container {
  readonly db: SqliteSessionDbAdapter
  readonly resolver: ProjectResolverAdapter
  readonly fs: DirectoryScannerAdapter
  readonly transferSession: TransferSessionUseCase
  readonly listRecentDirectories: ListRecentDirectoriesUseCase
  readonly buildDirectoryOptions: BuildDirectoryOptionsUseCase
}

export function createContainer(customDbPath?: string): Container {
  const db = new SqliteSessionDbAdapter(customDbPath)
  const resolver = new ProjectResolverAdapter()
  const fs = new DirectoryScannerAdapter()
  const transferSession = new TransferSessionUseCase(db, resolver, fs)
  const listRecentDirectories = new ListRecentDirectoriesUseCase(db)
  const buildDirectoryOptions = new BuildDirectoryOptionsUseCase(db, fs)

  return {
    db,
    resolver,
    fs,
    transferSession,
    listRecentDirectories,
    buildDirectoryOptions,
  }
}
