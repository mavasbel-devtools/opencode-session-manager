import { execFile } from "node:child_process"
import { promisify } from "node:util"
import type { ServicePort } from "@session-manager/domain/ports/outbound/ServicePort"

const run = promisify(execFile)

const SCRIPT = [
  "Get-CimInstance Win32_Process",
  "| Where-Object { $_.Name -match '^opencode(\\.exe)?$' -and $_.CommandLine -match '(^|\\s)serve(\\s|$)' }",
  "| ForEach-Object { \"$($_.ProcessId)|$($_.CreationDate.ToString('o'))\" }",
].join(" ")

/**
 * Parses one `ProcessId|CreationDate` output line into its start (ms since the epoch),
 * or null when the line is malformed.
 */
export function parseCimServiceRow(line: string): number | null {
  const match = line.match(/^(\d+)\|(.+)$/)
  if (match === null) return null
  const started = Date.parse(match[2] as string)
  return Number.isNaN(started) ? null : started
}

/**
 * `ServicePort` on Windows: the newest `opencode(.exe) … serve` process, from
 * `Get-CimInstance Win32_Process` filtered on its `CommandLine`, newest `CreationDate`.
 * The PowerShell executable is a constructor argument so the adapter can be exercised
 * against a stand-in off Windows.
 */
export class CimServiceAdapter implements ServicePort {
  constructor(private readonly powershell: string) {}

  async startedAt(): Promise<number | null> {
    const { stdout } = await run(this.powershell, ["-NoProfile", "-Command", SCRIPT])
    let newest: number | null = null
    for (const line of stdout.split(/\r?\n/)) {
      const started = parseCimServiceRow(line.trim())
      if (started === null) continue
      if (newest === null || started > newest) newest = started
    }
    return newest
  }
}
