import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import type { ProcessEntry } from "@session-manager/domain/model/Database"
import type { ProcessListPort } from "@session-manager/domain/ports/outbound/ProcessListPort"
import { isPid, readProc } from "@session-manager/infrastructure/adapters/outbound/platform/linux/ProcFs"

/**
 * Linux: the running processes whose `/proc/<pid>/comm` equals the image name. `comm` is the
 * executable's name truncated to 15 bytes, which `opencode` fits. Processes that exit mid-scan are
 * skipped.
 */
export class ProcProcessListAdapter implements ProcessListPort {
  private readonly procRoot: string

  constructor(procRoot: string) {
    this.procRoot = procRoot
  }

  list(image: string): readonly ProcessEntry[] {
    return readdirSync(this.procRoot)
      .filter(isPid)
      .filter((pid) => readProc(() => readFileSync(join(this.procRoot, pid, "comm"), "utf8").trim(), null) === image)
      .map((pid) => ({ image, pid: Number(pid) }))
  }
}
