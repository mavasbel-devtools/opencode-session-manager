import { appendFile, mkdir } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import type { AuditLogPort, AuditRecord } from "@session-manager/domain/ports/outbound/AuditLogPort"

/** One JSON object per line, appended; each line also names the user and process that wrote it. */
export class JsonlAuditLogAdapter implements AuditLogPort {
  constructor(private readonly file: string) {}

  location(): string {
    return this.file
  }

  async append(record: AuditRecord): Promise<void> {
    await mkdir(path.dirname(this.file), { recursive: true })
    const line = JSON.stringify({ ...record, user: os.userInfo().username, pid: process.pid })
    await appendFile(this.file, `${line}\n`, { mode: 0o600 })
  }
}
