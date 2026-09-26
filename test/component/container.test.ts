import { describe, it, expect } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createContainer, createV2Container } from "@transfer/main/container"
import { OpenCode2HostAdapter } from "@transfer/infrastructure/adapters/outbound/opencode2/OpenCode2HostAdapter"
import { MoveSessionUseCase } from "@transfer/application/MoveSessionUseCase"
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

  it("wires the OpenCode 2 container without SQLite", () => {
    const client = {
      session: { list: async () => ({ data: [] }), move: async () => undefined },
      project: { list: async () => [] },
    }
    const container = createV2Container(client)
    expect(container.host).toBeInstanceOf(OpenCode2HostAdapter)
    expect(container.fs).toBeInstanceOf(DirectoryScannerAdapter)
    expect(container.moveSession).toBeInstanceOf(MoveSessionUseCase)
    expect(container.buildDirectoryOptions).toBeInstanceOf(BuildDirectoryOptionsUseCase)
    expect("db" in container).toBe(false)
  })
})
