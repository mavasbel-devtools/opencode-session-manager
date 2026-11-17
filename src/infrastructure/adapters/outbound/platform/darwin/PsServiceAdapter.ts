import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { basename } from "node:path"
import type { ServicePort } from "@session-manager/domain/ports/outbound/ServicePort"

const run = promisify(execFile)

/** `opencode`, or `opencode.exe`, the binary the bun-installed @opencode/cli package runs (OpenCode 2.0.28). */
const OPENCODE = /^opencode(\.exe)?$/

const MONTHS: Readonly<Record<string, number>> = {
  Jan: 0,
  Feb: 1,
  Mar: 2,
  Apr: 3,
  May: 4,
  Jun: 5,
  Jul: 6,
  Aug: 7,
  Sep: 8,
  Oct: 9,
  Nov: 10,
  Dec: 11,
}

/**
 * Parses one `LC_ALL=C ps -axo pid=,lstart=,args=` row into its pid, start (ms since the epoch,
 * in the local time zone `ps` reports) and argument words, or null when the row is malformed.
 */
export function parsePsServiceRow(line: string): { pid: number; started: number; args: readonly string[] } | null {
  const match = line.match(/^\s*(\d+)\s+(\w{3})\s+(\w{3})\s+(\d+)\s+(\d+):(\d+):(\d+)\s+(\d{4})\s+(.*)$/)
  if (match === null) return null
  const month = MONTHS[match[3] as string]
  if (month === undefined) return null
  const started = new Date(Number(match[8]), month, Number(match[4]), Number(match[5]), Number(match[6]), Number(match[7])).getTime()
  if (Number.isNaN(started)) return null
  return { pid: Number(match[1]), started, args: (match[9] as string).split(/\s+/) }
}

/**
 * `ServicePort` on macOS: the newest running `opencode … serve` process, from
 * `ps -axo pid=,lstart=,args=`. The executable is a constructor argument so the adapter can be
 * exercised against a stand-in off macOS.
 */
export class PsServiceAdapter implements ServicePort {
  constructor(private readonly psPath: string) {}

  async startedAt(): Promise<number | null> {
    const { stdout } = await run(this.psPath, ["-axo", "pid=,lstart=,args="], { env: { ...process.env, LC_ALL: "C" } })
    let newest: number | null = null
    for (const line of stdout.split("\n")) {
      const row = parsePsServiceRow(line)
      if (row === null) continue
      if (!row.args.some((arg) => OPENCODE.test(basename(arg))) || !row.args.includes("serve")) continue
      if (newest === null || row.started > newest) newest = row.started
    }
    return newest
  }
}
