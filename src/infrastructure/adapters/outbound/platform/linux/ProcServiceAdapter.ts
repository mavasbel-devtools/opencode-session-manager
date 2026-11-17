import { readdir, readFile } from "node:fs/promises"
import path from "node:path"
import type { ServicePort } from "@session-manager/domain/ports/outbound/ServicePort"

async function readOrNull(file: string): Promise<string | null> {
  return readFile(file, "utf8").catch(() => null)
}

/** `opencode`, or `opencode.exe`, the binary the bun-installed @opencode/cli package runs (OpenCode 2.0.28). */
const OPENCODE = /^opencode(\.exe)?$/

/**
 * The newest running `opencode … serve` process, from /proc: its start is the boot time
 * (`btime` in /proc/stat) plus field 22 of /proc/<pid>/stat, in clock ticks.
 */
export class ProcServiceAdapter implements ServicePort {
  constructor(
    private readonly procRoot: string,
    private readonly clockTicksPerSecond: number,
  ) {}

  async startedAt(): Promise<number | null> {
    const boot = (await readOrNull(path.join(this.procRoot, "stat")))?.match(/^btime (\d+)$/m)
    if (!boot) return null
    let newest: number | null = null
    for (const pid of (await readdir(this.procRoot)).filter((name) => /^\d+$/.test(name))) {
      const args = (await readOrNull(path.join(this.procRoot, pid, "cmdline")))?.split("\0") ?? []
      if (!args.some((arg) => OPENCODE.test(path.basename(arg))) || !args.includes("serve")) continue
      const stat = await readOrNull(path.join(this.procRoot, pid, "stat"))
      if (stat === null) continue
      const ticks = Number(stat.slice(stat.lastIndexOf(")") + 2).split(" ")[19])
      const started = (Number(boot[1]) + ticks / this.clockTicksPerSecond) * 1000
      if (newest === null || started > newest) newest = started
    }
    return newest
  }
}
