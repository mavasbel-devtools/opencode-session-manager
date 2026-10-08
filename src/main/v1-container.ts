import { BuildDirectoryOptionsUseCase } from "@session-manager/application/BuildDirectoryOptionsUseCase"
import { TransferSessionUseCase } from "@session-manager/application/TransferSessionUseCase"
import { SessionTransferV1TuiAdapter } from "@session-manager/infrastructure/adapters/inbound/tui/SessionTransferV1TuiAdapter"
import { NodeFileSystemAdapter } from "@session-manager/infrastructure/adapters/outbound/fs/NodeFileSystemAdapter"
import { ProjectResolverAdapter } from "@session-manager/infrastructure/adapters/outbound/project/ProjectResolverAdapter"
import { SystemHomeDirectoryAdapter } from "@session-manager/infrastructure/adapters/outbound/system/SystemHomeDirectoryAdapter"
import { SqliteSessionDbAdapter } from "@session-manager/infrastructure/adapters/outbound/sqlite/SqliteSessionDbAdapter"

export interface V1Container {
  readonly db: SqliteSessionDbAdapter
  readonly transfer: SessionTransferV1TuiAdapter
}

/**
 * Composition root of the OpenCode 1 TUI runtime. v1 has no session-move API,
 * so the transfer writes the v1 SQLite store directly and resolves the
 * destination project itself, the way the v1 host does.
 */
export function createV1Container(customDbPath?: string): V1Container {
  const db = new SqliteSessionDbAdapter(customDbPath)
  const fs = new NodeFileSystemAdapter()
  return {
    db,
    transfer: new SessionTransferV1TuiAdapter({
      db,
      home: new SystemHomeDirectoryAdapter(),
      transferSession: new TransferSessionUseCase(db, new ProjectResolverAdapter(), fs),
      buildDirectoryOptions: new BuildDirectoryOptionsUseCase(db, fs),
    }),
  }
}
