/** Whether another process holds the database open, used to refuse a swap or a rollback under a live writer. */
export interface DatabaseHoldersPort {
  /**
   * A short description of what holds `dbPath` (or its `-wal`/`-shm`/`-journal` sidecars) open, for the
   * operator; `null` when nothing does.
   */
  heldBy(dbPath: string): string | null
}
