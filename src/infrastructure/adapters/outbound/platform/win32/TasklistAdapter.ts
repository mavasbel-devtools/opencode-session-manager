import { execFileSync } from "node:child_process"
import type { ProcessEntry } from "@session-manager/domain/model/Database"
import type { ProcessListPort } from "@session-manager/domain/ports/outbound/ProcessListPort"

/** Reads `tasklist` CSV rows of the shape `"image","pid",...`, ignoring its INFO lines. */
export function parseTasklist(csv: string): readonly ProcessEntry[] {
  return csv
    .split(/\r?\n/)
    .map((line) => line.match(/^"([^"]*)","(\d+)"/))
    .filter((match): match is RegExpMatchArray => match !== null)
    .map((match) => ({ image: match[1] as string, pid: Number(match[2]) }))
}

/**
 * Windows: the running processes with a given image name, from `tasklist`. The executable is a
 * constructor argument so the adapter can be exercised against a stand-in off Windows.
 */
export class TasklistAdapter implements ProcessListPort {
  private readonly executable: string

  constructor(executable: string) {
    this.executable = executable
  }

  list(image: string): readonly ProcessEntry[] {
    const csv = execFileSync(this.executable, ["/fo", "csv", "/nh", "/fi", `imagename eq ${image}`], { encoding: "utf8" })
    return parseTasklist(csv).filter((entry) => entry.image.toLowerCase() === image.toLowerCase())
  }
}
