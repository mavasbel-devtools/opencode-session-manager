import type { GuardService } from "@session-manager/application/GuardService"
import { MissingOriginalError } from "@session-manager/domain/errors/MissingOriginalError"
import { ProcessRunningError } from "@session-manager/domain/errors/ProcessRunningError"
import { baseName, joinPath } from "@session-manager/domain/model/DatabasePaths"
import { SIDECARS } from "@session-manager/domain/model/Sidecars"
import type { RollbackInput, RollbackOutcome, RollbackPort } from "@session-manager/domain/ports/inbound/RollbackPort"
import type { MaintenanceFileSystemPort } from "@session-manager/domain/ports/outbound/MaintenanceFileSystemPort"
import type { ProcessListPort } from "@session-manager/domain/ports/outbound/ProcessListPort"
import type { RuntimePort } from "@session-manager/domain/ports/outbound/RuntimePort"

/** Puts the original database back and parks whatever was in place. */
export class RollbackUseCase implements RollbackPort {
  private readonly fileSystem: MaintenanceFileSystemPort
  private readonly processes: ProcessListPort
  private readonly guard: GuardService
  private readonly runtime: RuntimePort

  constructor(fileSystem: MaintenanceFileSystemPort, processes: ProcessListPort, guard: GuardService, runtime: RuntimePort) {
    this.fileSystem = fileSystem
    this.processes = processes
    this.guard = guard
    this.runtime = runtime
  }

  execute(input: RollbackInput): RollbackOutcome {
    const original = joinPath(input.backupDir, baseName(input.dbPath))
    if (!this.fileSystem.exists(original)) throw new MissingOriginalError(input.backupDir)

    const running = this.processes.list(input.image)
    if (running.length > 0) {
      throw new ProcessRunningError(
        input.image,
        running.map((entry) => entry.pid),
        "close it first",
      )
    }

    const parked = joinPath(input.backupDir, `rolled-back-${this.runtime.stamp()}`)
    this.fileSystem.mkdirp(parked)
    if (this.fileSystem.exists(input.dbPath)) this.guard.assertNotHeld(input.dbPath)

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
    return { restored, parked }
  }
}
