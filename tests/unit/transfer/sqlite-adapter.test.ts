import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { Database } from "bun:sqlite"
import { SqliteSessionDbAdapter } from "@session-manager/infrastructure/adapters/outbound/sqlite/SqliteSessionDbAdapter"
import path from "node:path"
import fs from "node:fs"
import os from "node:os"

describe("SqliteSessionDbAdapter", () => {
  let tmpDbPath: string
  let adapter: SqliteSessionDbAdapter

  beforeEach(() => {
    tmpDbPath = path.join(os.tmpdir(), `test-opencode-${Date.now()}-${Math.random().toString(36).slice(2)}.db`)
    const rawDb = new Database(tmpDbPath)

    // Set up schema matching OpenCode
    rawDb.run(`
      CREATE TABLE IF NOT EXISTS project (
        id TEXT PRIMARY KEY,
        worktree TEXT NOT NULL,
        sandboxes TEXT NOT NULL,
        time_created INTEGER NOT NULL,
        time_updated INTEGER NOT NULL
      );
    `)

    rawDb.run(`
      CREATE TABLE IF NOT EXISTS session (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        directory TEXT NOT NULL,
        path TEXT,
        title TEXT,
        time_created INTEGER,
        time_updated INTEGER
      );
    `)

    rawDb.run(`
      INSERT INTO session (id, project_id, directory, path, title, time_created, time_updated)
      VALUES 
        ('ses_1', 'proj_a', 'C:\\work\\a', '', 'Session A', 100, 200),
        ('ses_2', 'proj_b', 'C:\\work\\b', 'sub', 'Session B', 100, 300);
    `)

    rawDb.close()
    adapter = new SqliteSessionDbAdapter(tmpDbPath)
  })

  afterEach(() => {
    adapter.close()
    if (fs.existsSync(tmpDbPath)) {
      try {
        fs.unlinkSync(tmpDbPath)
      } catch (_) {}
    }
  })

  it("fetches an existing session by ID", async () => {
    const s = await adapter.getSession("ses_1")
    expect(s).not.toBeNull()
    expect(s?.id).toBe("ses_1")
    expect(s?.directory).toBe("C:\\work\\a")
    expect(s?.projectId).toBe("proj_a")
    expect(s?.title).toBe("Session A")
  })

  it("returns null for a non-existent session", async () => {
    const s = await adapter.getSession("ses_unknown")
    expect(s).toBeNull()
  })

  it("lists all sessions ordered by time_updated DESC", async () => {
    const list = await adapter.listSessions()
    expect(list.length).toBe(2)
    expect(list[0]?.id).toBe("ses_2")
    expect(list[1]?.id).toBe("ses_1")
  })

  it("lists recent unique directories", async () => {
    const dirs = await adapter.listRecentDirectories()
    expect(dirs).toContain("C:\\work\\a")
    expect(dirs).toContain("C:\\work\\b")
  })

  it("updates session location, projectId and path", async () => {
    await adapter.updateSessionLocation("ses_1", "C:\\new\\location", "proj_new", "pkg/core")

    const updated = await adapter.getSession("ses_1")
    expect(updated?.directory).toBe("C:\\new\\location")
    expect(updated?.projectId).toBe("proj_new")
    expect(updated?.path).toBe("pkg/core")
  })

  it("upserts project record safely", async () => {
    await adapter.upsertProject("proj_c", "C:\\work\\c")

    // Insert again with different worktree to test update
    await adapter.upsertProject("proj_c", "C:\\work\\c-updated")

    // Verify in db
    const checkDb = new Database(tmpDbPath)
    const row = checkDb.query("SELECT * FROM project WHERE id = 'proj_c'").get() as any
    expect(row.worktree).toBe("C:\\work\\c-updated")
    checkDb.close()
  })
})
