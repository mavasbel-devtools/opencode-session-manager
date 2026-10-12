import { StoreLockService } from "@session-manager/application/StoreLockService"
import { StoreLockedError } from "@session-manager/domain/errors/StoreLockedError"
import { lockFileOf, type LockOwner, type StaleLock } from "@session-manager/domain/model/StoreLock"
import type { RuntimePort } from "@session-manager/domain/ports/outbound/RuntimePort"
import type { StoreLockHandle, StoreLockPort } from "@session-manager/domain/ports/outbound/StoreLockPort"

/** Locks in memory: `held` names stores another process holds; `stale` lists locks to report as cleared. */
export class FakeStoreLock implements StoreLockPort {
  readonly held = new Map<string, LockOwner>()
  readonly taken: string[][] = []
  stale: StaleLock[] = []
  releases = 0

  constructor() {}

  acquire(stores: readonly string[], owner: LockOwner): StoreLockHandle {
    for (const store of stores) {
      const holder = this.held.get(store)
      if (holder !== undefined) throw new StoreLockedError(store, lockFileOf(store), holder)
    }
    this.taken.push([...stores])
    for (const store of stores) this.held.set(store, owner)
    return {
      cleared: this.stale,
      release: () => {
        this.releases++
        for (const store of stores) this.held.delete(store)
      },
    }
  }
}

/** The lock service over a fake lock. */
export function fakeLocks(runtime: RuntimePort, lock: FakeStoreLock = new FakeStoreLock()): StoreLockService {
  return new StoreLockService(lock, runtime)
}
