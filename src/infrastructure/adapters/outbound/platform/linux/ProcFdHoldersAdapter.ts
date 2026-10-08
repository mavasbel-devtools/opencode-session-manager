import { readdirSync, readFileSync, readlinkSync, realpathSync } from "node:fs"
import { basename, dirname, join, resolve } from "node:path"
import type { DatabaseHoldersPort } from "#domain/ports/outbound/DatabaseHoldersPort.ts"
import { isPid, readProc } from "#infrastructure/adapters/outbound/platform/linux/ProcFs.ts"

const SIDECARS = ["", "-wal", "-shm", "-journal"]

/**
 * Linux: renaming an open file succeeds there, so the Windows probe proves nothing. Instead every
 * `/proc/<pid>/fd/*` link is read and compared with the database and its sidecars, which names the
 * holders. Processes that vanish or are not readable mid-scan are skipped; the tool's own process is
 * not exempt, so a connection it forgot to close is caught too.
 */
export class ProcFdHoldersAdapter implements DatabaseHoldersPort {
  private readonly procRoot: string

  constructor(procRoot: string) {
    this.procRoot = procRoot
  }

  heldBy(dbPath: string): string | null {
    // The link targets in /proc are canonical, so the database's directory is made canonical too.
    const directory = readProc(() => realpathSync(dirname(dbPath)), resolve(dirname(dbPath)))
    const targets = new Set(SIDECARS.map((suffix) => `${join(directory, basename(dbPath))}${suffix}`))
    const holders = readdirSync(this.procRoot)
      .filter(isPid)
      .filter((pid) =>
        readProc(() => readdirSync(join(this.procRoot, pid, "fd")), [] as string[]).some((fd) =>
          targets.has(readProc(() => readlinkSync(join(this.procRoot, pid, "fd", fd)), "")),
        ),
      )
      .map((pid) => `${readProc(() => readFileSync(join(this.procRoot, pid, "comm"), "utf8").trim(), "?")} ${pid}`)
    return holders.length > 0 ? holders.join(", ") : null
  }
}
