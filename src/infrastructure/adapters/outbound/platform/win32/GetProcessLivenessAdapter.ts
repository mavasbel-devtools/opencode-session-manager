import { execFile } from "node:child_process"
import { promisify } from "node:util"
import type { ProcessLivenessPort } from "@session-manager/domain/ports/outbound/ProcessLivenessPort"

const run = promisify(execFile)

/**
 * `ProcessLivenessPort` on Windows: `Get-Process -Id <pid>` succeeds. The PowerShell
 * executable is a constructor argument so the adapter can be exercised against a stand-in
 * off Windows.
 */
export class GetProcessLivenessAdapter implements ProcessLivenessPort {
  constructor(private readonly powershell: string) {}

  async isAlive(pid: number): Promise<boolean> {
    if (!Number.isInteger(pid) || pid <= 0) return false
    try {
      await run(this.powershell, ["-NoProfile", "-Command", `Get-Process -Id ${pid} | Out-Null`])
      return true
    } catch {
      return false
    }
  }
}
