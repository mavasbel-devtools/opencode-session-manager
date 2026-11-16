import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import type { DatabaseHoldersPort } from "@session-manager/domain/ports/outbound/DatabaseHoldersPort"

const SIDECARS = ["", "-wal", "-shm", "-journal"]

/**
 * Reads `lsof -F pc` rows (`p<pid>` then `c<command>` per holder, with `f` rows between),
 * ignoring anything else. A `c` row without a preceding numeric `p` row names nothing.
 */
export function parseLsof(output: string): readonly string[] {
  const holders: string[] = []
  let pid: string | null = null
  for (const line of output.split("\n")) {
    if (line.startsWith("p") && /^\d+$/.test(line.slice(1))) pid = line.slice(1)
    else if (line.startsWith("c") && pid !== null) {
      holders.push(`${line.slice(1)} ${pid}`)
      pid = null
    }
  }
  return holders
}

/**
 * macOS: `lsof` names the processes holding the database or its sidecars open, as
 * `<command> <pid>` joined by `, ` (the same contract as `ProcFdHoldersAdapter`). Only files
 * that exist are asked about, so a missing sidecar is skipped and an absent database reports
 * `null`; exit 1 with empty output means no holder. The tool's own process is not exempt,
 * so a connection it forgot to close is caught too. The executable is a constructor argument
 * so the adapter can be exercised against a stand-in off macOS.
 */
export class LsofHoldersAdapter implements DatabaseHoldersPort {
  private readonly lsofPath: string

  constructor(lsofPath: string) {
    this.lsofPath = lsofPath
  }

  heldBy(dbPath: string): string | null {
    const targets = SIDECARS.map((suffix) => `${dbPath}${suffix}`).filter((path) => existsSync(path))
    if (targets.length === 0) return null
    const run = spawnSync(this.lsofPath, ["-nP", "-F", "pc", "--", ...targets], { encoding: "utf8" })
    if (run.error) throw run.error
    const stdout = run.stdout ?? ""
    if (run.status === 1 && stdout.trim() === "") return null
    const holders = parseLsof(stdout)
    return holders.length > 0 ? holders.join(", ") : null
  }
}
