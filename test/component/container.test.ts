import { describe, it, expect } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createContainer } from "@transfer/main/container"
import { SqliteSessionDbAdapter } from "@transfer/infrastructure/adapters/outbound/sqlite/SqliteSessionDbAdapter"
import { ProjectResolverAdapter } from "@transfer/infrastructure/adapters/outbound/project/ProjectResolverAdapter"
import { DirectoryScannerAdapter } from "@transfer/infrastructure/adapters/outbound/fs/DirectoryScannerAdapter"
import { TransferSessionUseCase } from "@transfer/application/TransferSessionUseCase"
import { ListRecentDirectoriesUseCase } from "@transfer/application/ListRecentDirectoriesUseCase"
import { BuildDirectoryOptionsUseCase } from "@transfer/application/BuildDirectoryOptionsUseCase"

describe("createContainer", () => {
  it("wires every adapter and use case", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "container-"))
    const dbPath = path.join(dir, "opencode.db")
    try {
      const container = createContainer(dbPath)
      expect(container.db).toBeInstanceOf(SqliteSessionDbAdapter)
      expect(container.resolver).toBeInstanceOf(ProjectResolverAdapter)
      expect(container.fs).toBeInstanceOf(DirectoryScannerAdapter)
      expect(container.transferSession).toBeInstanceOf(TransferSessionUseCase)
      expect(container.listRecentDirectories).toBeInstanceOf(ListRecentDirectoriesUseCase)
      expect(container.buildDirectoryOptions).toBeInstanceOf(BuildDirectoryOptionsUseCase)
      container.db.close()
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})
