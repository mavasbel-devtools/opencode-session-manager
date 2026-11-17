import type { ProcessLivenessPort } from "@session-manager/domain/ports/outbound/ProcessLivenessPort"

/**
 * `ProcessLivenessPort` on macOS: `process.kill(pid, 0)` raises `ESRCH` when no such process
 * exists (the same probe `FsStoreLockAdapter` uses); any other outcome means it is alive.
 */
export class KillZeroLivenessAdapter implements ProcessLivenessPort {
  constructor() {}

  async isAlive(pid: number): Promise<boolean> {
    try {
      process.kill(pid, 0)
      return true
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ESRCH") return false
      return true
    }
  }
}
