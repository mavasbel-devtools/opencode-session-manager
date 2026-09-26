import { TransferSessionUseCase } from "@transfer/application/TransferSessionUseCase"
import { ListRecentDirectoriesUseCase } from "@transfer/application/ListRecentDirectoriesUseCase"
import { BuildDirectoryOptionsUseCase } from "@transfer/application/BuildDirectoryOptionsUseCase"
import { MoveSessionUseCase } from "@transfer/application/MoveSessionUseCase"
import { SqliteSessionDbAdapter } from "@transfer/infrastructure/adapters/outbound/sqlite/SqliteSessionDbAdapter"
import { ProjectResolverAdapter } from "@transfer/infrastructure/adapters/outbound/project/ProjectResolverAdapter"
import { DirectoryScannerAdapter } from "@transfer/infrastructure/adapters/outbound/fs/DirectoryScannerAdapter"
import { OpenCode2HostAdapter, type OpenCode2Client } from "@transfer/infrastructure/adapters/outbound/opencode2/OpenCode2HostAdapter"

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

export interface V2Container {
  readonly host: OpenCode2HostAdapter
  readonly fs: DirectoryScannerAdapter
  readonly moveSession: MoveSessionUseCase
  readonly buildDirectoryOptions: BuildDirectoryOptionsUseCase
}

/**
 * OpenCode 2 wiring: no SQLite access. The v2 server owns the session store
 * (event-sourced), so every read and the move itself go through its API.
 */
export function createV2Container(client: OpenCode2Client): V2Container {
  const host = new OpenCode2HostAdapter(client)
  const fs = new DirectoryScannerAdapter()
  const moveSession = new MoveSessionUseCase(host, fs)
  const buildDirectoryOptions = new BuildDirectoryOptionsUseCase(host, fs)
  return { host, fs, moveSession, buildDirectoryOptions }
}
