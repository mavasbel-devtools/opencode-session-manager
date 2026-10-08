import { describe, expect, it } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { SessionTransferV1TuiAdapter } from "@session-manager/infrastructure/adapters/inbound/tui/SessionTransferV1TuiAdapter"
import { SqliteSessionDbAdapter } from "@session-manager/infrastructure/adapters/outbound/sqlite/SqliteSessionDbAdapter"
import { createV1Container } from "@session-manager/main/v1-container"
import { removeTemporarySync } from "@test/support/live/process"

describe("createV1Container", () => {
  it("wires the v1 transfer command against the given SQLite store", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "session-manager-v1-container-"))
    try {
      const container = createV1Container(path.join(directory, "opencode.db"))
      expect(container.db).toBeInstanceOf(SqliteSessionDbAdapter)
      expect(container.transfer).toBeInstanceOf(SessionTransferV1TuiAdapter)
      container.db.close()
    } finally {
      removeTemporarySync(directory)
    }
  })
})
