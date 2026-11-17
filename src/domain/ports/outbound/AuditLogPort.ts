export interface AuditRecord {
  readonly time: string
  readonly action: "apply" | "undo" | "follow" | "rollback"
  readonly patch: string
  readonly version: string
  readonly root: string
  readonly path: string
  readonly from: string | null
  readonly to: string | null
  readonly outcome: string
  readonly backup: string | null
  readonly reason: string | null
}

/** An append-only record of every change made to the installed files. */
export interface AuditLogPort {
  location(): string
  append(record: AuditRecord): Promise<void>
}
