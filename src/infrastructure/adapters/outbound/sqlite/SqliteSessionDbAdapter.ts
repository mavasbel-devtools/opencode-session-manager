import { Database } from "bun:sqlite"
import path from "node:path"
import os from "node:os"
import type { SessionSummary } from "@session-manager/domain/model/Session"
import { DatabaseError } from "@session-manager/domain/errors/DatabaseError"
import type { SessionDbPort } from "@session-manager/domain/ports/outbound/SessionDbPort"

export class SqliteSessionDbAdapter implements SessionDbPort {
  private db: Database | null = null

  constructor(private readonly customDbPath?: string) {}

  private getDatabase(): Database {
    if (this.db) return this.db

    const dbPath =
      this.customDbPath ??
      process.env["OPENCODE_DB_PATH"] ??
      path.join(
        process.env["XDG_DATA_HOME"] ?? path.join(os.homedir(), ".local", "share"),
        "opencode",
        "opencode.db",
      )

    try {
      this.db = new Database(dbPath)
      this.db.run("PRAGMA journal_mode = WAL;")
      return this.db
    } catch (err) {
      throw new DatabaseError(`Failed to open opencode database at ${dbPath}`, err)
    }
  }

  async getSession(sessionId: string): Promise<SessionSummary | null> {
    // Opened outside the try, so an open failure keeps its own message.
    const db = this.getDatabase()
    try {
      const row = db
        .query(
          "SELECT id, title, directory, project_id, path, time_updated FROM session WHERE id = ? LIMIT 1",
        )
        .get(sessionId) as {
        id: string
        title: string
        directory: string
        project_id: string
        path: string | null
        time_updated: number
      } | null

      if (!row) return null

      return {
        id: row.id,
        title: row.title ?? "",
        directory: row.directory,
        projectId: row.project_id,
        path: row.path ?? "",
        timeUpdated: row.time_updated ?? 0,
      }
    } catch (err) {
      throw new DatabaseError(`Failed to read session ${sessionId}`, err)
    }
  }

  async listSessions(): Promise<SessionSummary[]> {
    // Opened outside the try, so an open failure keeps its own message.
    const db = this.getDatabase()
    try {
      const rows = db
        .query(
          "SELECT id, title, directory, project_id, path, time_updated FROM session ORDER BY time_updated DESC",
        )
        .all() as Array<{
        id: string
        title: string
        directory: string
        project_id: string
        path: string | null
        time_updated: number
      }>

      return rows.map((r) => ({
        id: r.id,
        title: r.title ?? "",
        directory: r.directory,
        projectId: r.project_id,
        path: r.path ?? "",
        timeUpdated: r.time_updated ?? 0,
      }))
    } catch (err) {
      throw new DatabaseError("Failed to list sessions", err)
    }
  }

  async listRecentDirectories(): Promise<string[]> {
    // Opened outside the try, so an open failure keeps its own message.
    const db = this.getDatabase()
    try {
      const rows = db
        .query(
          "SELECT DISTINCT directory FROM session WHERE directory IS NOT NULL AND directory != '' ORDER BY time_updated DESC LIMIT 50",
        )
        .all() as Array<{ directory: string }>

      return rows.map((r) => r.directory)
    } catch (err) {
      throw new DatabaseError("Failed to list recent directories", err)
    }
  }

  async updateSessionLocation(
    sessionId: string,
    newDirectory: string,
    newProjectId: string,
    newPath: string,
  ): Promise<void> {
    // Opened outside the try, so an open failure keeps its own message.
    const db = this.getDatabase()
    try {
      const now = Date.now()
      db.query(
        `UPDATE session 
         SET directory = ?, project_id = ?, path = ?, time_updated = ? 
         WHERE id = ?`,
      ).run(newDirectory, newProjectId, newPath, now, sessionId)
    } catch (err) {
      throw new DatabaseError(`Failed to update session location for ${sessionId}`, err)
    }
  }

  async upsertProject(projectId: string, worktree: string): Promise<void> {
    // Opened outside the try, so an open failure keeps its own message.
    const db = this.getDatabase()
    try {
      const now = Date.now()
      db.query(
        `INSERT INTO project (id, worktree, sandboxes, time_created, time_updated)
         VALUES (?, ?, '[]', ?, ?)
         ON CONFLICT(id) DO UPDATE SET worktree = excluded.worktree, time_updated = excluded.time_updated`,
      ).run(projectId, worktree, now, now)
    } catch (err) {
      throw new DatabaseError(`Failed to upsert project ${projectId}`, err)
    }
  }

  close(): void {
    if (this.db) {
      this.db.close()
      this.db = null
    }
  }
}
