import type { StaleLock } from "@session-manager/domain/model/StoreLock"
import type { RuntimePort } from "@session-manager/domain/ports/outbound/RuntimePort"
import type { StoreLockPort } from "@session-manager/domain/ports/outbound/StoreLockPort"

/**
 * Runs a write under the locks of the stores it writes, so two opencode-session-manager processes
 * never write the same store at once. The locks are released however the work ends.
 */
export class StoreLockService {
  private readonly locks: StoreLockPort
  private readonly runtime: RuntimePort

  constructor(locks: StoreLockPort, runtime: RuntimePort) {
    this.locks = locks
    this.runtime = runtime
  }

  hold<T>(stores: readonly string[], command: string, work: (cleared: readonly StaleLock[]) => T): T {
    const handle = this.locks.acquire(stores, { pid: this.runtime.pid(), command, since: new Date(this.runtime.now()).toISOString() })
    try {
      return work(handle.cleared)
    } finally {
      handle.release()
    }
  }
}
