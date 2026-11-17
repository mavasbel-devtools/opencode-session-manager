import { stat } from "node:fs/promises"
import path from "node:path"
import type { ProcessLivenessPort } from "@session-manager/domain/ports/outbound/ProcessLivenessPort"

/** `ProcessLivenessPort` on Linux: `<procRoot>/<pid>` exists. */
export class ProcLivenessAdapter implements ProcessLivenessPort {
  constructor(private readonly procRoot: string) {}

  async isAlive(pid: number): Promise<boolean> {
    if (!Number.isInteger(pid) || pid <= 0) return false
    return (await stat(path.join(this.procRoot, String(pid))).catch(() => null)) !== null
  }
}
