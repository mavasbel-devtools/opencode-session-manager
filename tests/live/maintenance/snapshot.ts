import { Database } from "bun:sqlite"

/**
 * A consistent point-in-time copy of a database, taken with `VACUUM INTO` from a read-only
 * connection: the live file is never opened for writing, and no WAL file is copied or
 * checkpointed by hand.
 */
export async function snapshotDatabase(source: string, target: string): Promise<void> {
  const db = new Database(source, { readonly: true })
  try {
    db.query("vacuum into ?").run(target)
  } finally {
    db.close()
  }
}

/** Writes and drops a scratch table in a snapshot, so it holds free pages the way a used database does. */
export function addFreePages(snapshot: string): void {
  const db = new Database(snapshot)
  try {
    db.exec("create table scratch_free_pages(v blob)")
    const insert = db.query("insert into scratch_free_pages values (randomblob(4096))")
    db.transaction(() => {
      for (let index = 0; index < 2048; index++) insert.run()
    })()
    db.exec("drop table scratch_free_pages")
  } finally {
    db.close()
  }
}
