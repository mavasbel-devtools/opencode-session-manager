import fs from "node:fs"
import { StoreLockedError } from "@session-manager/domain/errors/StoreLockedError"
import { lockFileOf, type LockOwner, type StaleLock } from "@session-manager/domain/model/StoreLock"
import type { StoreLockHandle, StoreLockPort } from "@session-manager/domain/ports/outbound/StoreLockPort"

const code = (error: unknown) => (error as NodeJS.ErrnoException).code

/** Whether a process exists: signal 0 checks without signalling; EPERM means it exists but is someone else's. */
function alive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return code(error) === "EPERM"
  }
}

/** The owner a lock file names; null when it is gone, half written, damaged or not a file. */
function readOwner(file: string): LockOwner | null {
  let parsed: Partial<LockOwner>
  try {
    parsed = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<LockOwner>
  } catch {
    return null
  }
  return typeof parsed.pid === "number" && typeof parsed.command === "string" && typeof parsed.since === "string"
    ? { pid: parsed.pid, command: parsed.command, since: parsed.since }
    : null
}

/**
 * Lock files beside the stores (`<store>.session-manager.lock`), created exclusively (`wx`), so of
 * two processes only one gets each. A lock whose owner no longer exists is removed and reported;
 * an unreadable lock is never removed (another process may be writing it). Release removes a lock
 * only while it still names this owner.
 */
export class FsStoreLockAdapter implements StoreLockPort {
  constructor() {}

  acquire(stores: readonly string[], owner: LockOwner): StoreLockHandle {
    const taken: string[] = []
    const cleared: StaleLock[] = []
    const release = () => {
      for (const file of taken.splice(0).reverse()) {
        const current = readOwner(file)
        if (current !== null && current.pid === owner.pid && current.since === owner.since) fs.rmSync(file, { force: true })
      }
    }
    try {
      for (const store of [...new Set(stores)].sort()) {
        const file = lockFileOf(store)
        if (!this.create(file, owner)) {
          const holder = readOwner(file)
          if (holder === null || alive(holder.pid)) throw new StoreLockedError(store, file, holder)
          fs.rmSync(file, { force: true })
          cleared.push({ file, ...holder })
          if (!this.create(file, owner)) throw new StoreLockedError(store, file, readOwner(file))
        }
        taken.push(file)
      }
    } catch (error) {
      release()
      throw error
    }
    return { cleared, release }
  }

  /** Creates the lock file holding `owner`; false when it already exists. */
  private create(file: string, owner: LockOwner): boolean {
    try {
      fs.writeFileSync(file, `${JSON.stringify(owner)}\n`, { flag: "wx", mode: 0o600 })
      return true
    } catch (error) {
      if (code(error) === "EEXIST") return false
      throw error
    }
  }
}
