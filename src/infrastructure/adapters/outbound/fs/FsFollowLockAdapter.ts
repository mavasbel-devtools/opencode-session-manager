import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import type { FollowLockPort } from "@session-manager/domain/ports/outbound/FollowLockPort"
import type { ProcessLivenessPort } from "@session-manager/domain/ports/outbound/ProcessLivenessPort"

/**
 * A lock file holding the pid of its owner, created exclusively. A lock whose owner is gone
 * (the platform's liveness probe says so) is removed and taken once more, exclusively again,
 * so two runs never both hold it.
 */
export class FsFollowLockAdapter implements FollowLockPort {
  constructor(
    private readonly file: string,
    private readonly liveness: ProcessLivenessPort,
  ) {}

  private async take(): Promise<() => Promise<void>> {
    await writeFile(this.file, String(process.pid), { flag: "wx" })
    return () => rm(this.file, { force: true })
  }

  async acquire(): Promise<(() => Promise<void>) | null> {
    await mkdir(path.dirname(this.file), { recursive: true })
    try {
      return await this.take()
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error
    }
    const owner = (await readFile(this.file, "utf8")).trim()
    if (/^\d+$/.test(owner) && (await this.liveness.isAlive(Number(owner)))) return null
    await rm(this.file, { force: true })
    return this.take()
  }
}
