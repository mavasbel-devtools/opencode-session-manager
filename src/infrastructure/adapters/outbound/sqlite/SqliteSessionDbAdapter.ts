import { and, desc, eq, isNotNull, ne } from "drizzle-orm"
import path from "node:path"
import os from "node:os"
import type { SessionSummary } from "@session-manager/domain/model/Session"
import { DatabaseError } from "@session-manager/domain/errors/DatabaseError"
import type { SessionDbPort } from "@session-manager/domain/ports/outbound/SessionDbPort"
import { openStore, type Store } from "@session-manager/infrastructure/adapters/outbound/sqlite/engine/Store"
import { project, session } from "@session-manager/infrastructure/adapters/outbound/sqlite/schema/opencode"

const COLUMNS = ["id", "title", "directory", "project_id", "path", "time_updated"] as const

function summary(row: { id: string | null; title: string | null; directory: string | null; project_id: string | null; path: string | null; time_updated: bigint | null }): SessionSummary {
  return {
    id: row.id ?? "",
    title: row.title ?? "",
    directory: row.directory ?? "",
    projectId: row.project_id ?? "",
    path: row.path ?? "",
    timeUpdated: Number(row.time_updated ?? 0),
  }
}

export class SqliteSessionDbAdapter implements SessionDbPort {
  private db: Store | null = null

  constructor(private readonly customDbPath?: string) {}

  private getDatabase(): Store {
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
      const store = openStore(dbPath, "write")
      this.db = store
      store.setWal()
      return store
    } catch (err) {
      throw new DatabaseError(`Failed to open opencode database at ${dbPath}`, err)
    }
  }

  async getSession(sessionId: string): Promise<SessionSummary | null> {
    // Opened outside the try, so an open failure keeps its own message.
    const db = this.getDatabase()
    try {
      const row = db.orm.select(db.pick(session, COLUMNS)).from(session).where(eq(session.id, sessionId)).limit(1).get()
      return row === undefined ? null : summary(row)
    } catch (err) {
      throw new DatabaseError(`Failed to read session ${sessionId}`, err)
    }
  }

  async listSessions(): Promise<SessionSummary[]> {
    // Opened outside the try, so an open failure keeps its own message.
    const db = this.getDatabase()
    try {
      return db.orm.select(db.pick(session, COLUMNS)).from(session).orderBy(desc(session.time_updated)).all().map(summary)
    } catch (err) {
      throw new DatabaseError("Failed to list sessions", err)
    }
  }

  async listRecentDirectories(): Promise<string[]> {
    // Opened outside the try, so an open failure keeps its own message.
    const db = this.getDatabase()
    try {
      db.pick(session, ["time_updated"])
      return db.orm
        .selectDistinct(db.pick(session, ["directory"]))
        .from(session)
        .where(and(isNotNull(session.directory), ne(session.directory, "")))
        .orderBy(desc(session.time_updated))
        .limit(50)
        .all()
        .map((row) => row.directory!)
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
      db.orm
        .update(session)
        .set({ directory: newDirectory, project_id: newProjectId, path: newPath, time_updated: BigInt(Date.now()) })
        .where(eq(session.id, sessionId))
        .run()
    } catch (err) {
      throw new DatabaseError(`Failed to update session location for ${sessionId}`, err)
    }
  }

  async upsertProject(projectId: string, worktree: string): Promise<void> {
    // Opened outside the try, so an open failure keeps its own message.
    const db = this.getDatabase()
    try {
      const now = BigInt(Date.now())
      db.insert(db.orm, project, { id: projectId, worktree, sandboxes: "[]", time_created: now, time_updated: now }, { target: ["id"], set: ["worktree", "time_updated"] })
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
