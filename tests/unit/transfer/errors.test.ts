import { describe, it, expect } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { DatabaseError } from "@session-manager/domain/errors/DatabaseError"
import { InvalidDirectoryError } from "@session-manager/domain/errors/InvalidDirectoryError"
import { SessionNotFoundError } from "@session-manager/domain/errors/SessionNotFoundError"
import { SqliteSessionDbAdapter } from "@session-manager/infrastructure/adapters/outbound/sqlite/SqliteSessionDbAdapter"

describe("domain errors", () => {
  it("SessionNotFoundError carries the session id", () => {
    const error = new SessionNotFoundError("ses_x")
    expect(error._tag).toBe("SessionNotFoundError")
    expect(error.sessionId).toBe("ses_x")
    expect(error.message).toContain("ses_x")
  })

  it("InvalidDirectoryError carries directory and reason", () => {
    const error = new InvalidDirectoryError("/tmp/x", "empty")
    expect(error._tag).toBe("InvalidDirectoryError")
    expect(error.directory).toBe("/tmp/x")
    expect(error.reason).toBe("empty")
  })

  it("DatabaseError carries an optional cause", () => {
    const cause = new Error("boom")
    const error = new DatabaseError("failed", cause)
    expect(error._tag).toBe("DatabaseError")
    expect(error.cause).toBe(cause)
  })
})

describe("SqliteSessionDbAdapter failure path", () => {
  it("wraps an unusable database path in DatabaseError", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bad-db-"))
    try {
      // A directory is not a valid SQLite database file.
      const adapter = new SqliteSessionDbAdapter(dir)
      await expect(adapter.listSessions()).rejects.toThrow(DatabaseError)
      adapter.close()
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})
