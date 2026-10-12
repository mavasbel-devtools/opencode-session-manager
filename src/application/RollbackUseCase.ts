import type { GuardService } from "@session-manager/application/GuardService"
import type { StoreLockService } from "@session-manager/application/StoreLockService"
import { MissingOriginalError } from "@session-manager/domain/errors/MissingOriginalError"
import { ProcessRunningError } from "@session-manager/domain/errors/ProcessRunningError"
import { baseName, joinPath } from "@session-manager/domain/model/DatabasePaths"
import { SIDECARS } from "@session-manager/domain/model/Sidecars"
import { lockFileOf, type StaleLock } from "@session-manager/domain/model/StoreLock"
import type { RollbackInput, RollbackOutcome, RollbackPort } from "@session-manager/domain/ports/inbound/RollbackPort"
import type { MaintenanceFileSystemPort } from "@session-manager/domain/ports/outbound/MaintenanceFileSystemPort"
import type { ProcessListPort } from "@session-manager/domain/ports/outbound/ProcessListPort"
import type { RuntimePort } from "@session-manager/domain/ports/outbound/RuntimePort"

/**
 * Puts the original database back and parks whatever was in place, under the stores' locks. It
 * refuses while a restored store is held open, and, for the stores OpenCode itself uses
 * (`liveStores`; every store when not given), while OpenCode runs at all.
 */
export class RollbackUseCase implements RollbackPort {
  private readonly fileSystem: MaintenanceFileSystemPort
  private readonly processes: ProcessListPort
  private readonly guard: GuardService
  private readonly runtime: RuntimePort
  private readonly locks: StoreLockService

  constructor(fileSystem: MaintenanceFileSystemPort, processes: ProcessListPort, guard: GuardService, runtime: RuntimePort, locks: StoreLockService) {
    this.fileSystem = fileSystem
    this.processes = processes
    this.guard = guard
    this.runtime = runtime
    this.locks = locks
  }

  executeAll(input: Omit<RollbackInput, "dbPath"> & { readonly dbPaths: readonly string[] }): readonly RollbackOutcome[] {
    for (const dbPath of input.dbPaths)
      if (!this.fileSystem.exists(joinPath(input.backupDir, baseName(dbPath)))) throw new MissingOriginalError(input.backupDir)
    // Every store is checked before any is restored, so a refusal never leaves them half rolled back.
    return this.locks.hold(input.dbPaths, "rollback", (cleared) => {
      const each = input.dbPaths.map((dbPath) => ({ ...input, dbPath }))
      for (const one of each) this.check(one)
      return each.map((one) => this.restore(one, cleared))
    })
  }

  execute(input: RollbackInput): RollbackOutcome {
    if (!this.fileSystem.exists(joinPath(input.backupDir, baseName(input.dbPath)))) throw new MissingOriginalError(input.backupDir)
    return this.locks.hold([input.dbPath], "rollback", (cleared) => {
      this.check(input)
      return this.restore(input, cleared)
    })
  }

  private check(input: RollbackInput): void {
    const running = input.liveStores === undefined || input.liveStores.includes(input.dbPath) ? this.processes.list(input.image) : []
    if (running.length > 0) {
      throw new ProcessRunningError(
        input.image,
        running.map((entry) => entry.pid),
        "close it first",
      )
    }
    if (this.fileSystem.exists(input.dbPath)) this.guard.assertNotHeld(input.dbPath)
  }

  private restore(input: RollbackInput, cleared: readonly StaleLock[]): RollbackOutcome {
    const parked = joinPath(input.backupDir, `rolled-back-${this.runtime.stamp()}`)
    this.fileSystem.mkdirp(parked)

    for (const suffix of SIDECARS) {
      if (this.fileSystem.exists(input.dbPath + suffix)) {
        this.fileSystem.rename(input.dbPath + suffix, joinPath(parked, baseName(input.dbPath) + suffix))
      }
    }

    const restored: string[] = []
    for (const suffix of SIDECARS) {
      const file = joinPath(input.backupDir, baseName(input.dbPath) + suffix)
      if (!this.fileSystem.exists(file)) continue
      this.fileSystem.rename(file, input.dbPath + suffix)
      restored.push(baseName(input.dbPath) + suffix)
    }
    return { restored, parked, staleLocksCleared: cleared.filter((lock) => lock.file === lockFileOf(input.dbPath)) }
  }
}
