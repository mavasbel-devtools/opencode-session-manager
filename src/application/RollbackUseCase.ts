import type { GuardService } from "#application/GuardService.ts"
import { MissingOriginalError, ProcessRunningError } from "#domain/errors/DomainErrors.ts"
import { baseName, joinPath } from "#domain/model/Paths.ts"
import { SIDECARS } from "#domain/model/Sidecars.ts"
import type { RollbackInput, RollbackOutcome, RollbackPort } from "#domain/ports/inbound/RollbackPort.ts"
import type { FileSystemPort } from "#domain/ports/outbound/FileSystemPort.ts"
import type { ProcessListPort } from "#domain/ports/outbound/ProcessListPort.ts"
import type { RuntimePort } from "#domain/ports/outbound/RuntimePort.ts"

/** Puts the original database back and parks whatever was in place. */
export class RollbackUseCase implements RollbackPort {
  private readonly fileSystem: FileSystemPort
  private readonly processes: ProcessListPort
  private readonly guard: GuardService
  private readonly runtime: RuntimePort

  constructor(fileSystem: FileSystemPort, processes: ProcessListPort, guard: GuardService, runtime: RuntimePort) {
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
