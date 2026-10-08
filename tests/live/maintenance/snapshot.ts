import { backup, DatabaseSync } from "node:sqlite"

/**
 * A consistent point-in-time copy of a database, taken with SQLite's online backup API from a
 * read-only source connection: the live file is never opened for writing, and no WAL file is
 * copied or checkpointed by hand.
 */
export async function snapshotDatabase(source: string, target: string): Promise<void> {
  const db = new DatabaseSync(source, { readOnly: true })
  try {
    await backup(db, target)
  } finally {
    db.close()
  }
}
