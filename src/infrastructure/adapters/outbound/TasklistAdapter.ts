import { execFileSync } from "node:child_process"
import type { ProcessEntry } from "#domain/model/Database.ts"
import type { ProcessListPort } from "#domain/ports/outbound/ProcessListPort.ts"

/** Reads `tasklist` CSV rows of the shape `"image","pid",...`, ignoring its INFO lines. */
export function parseTasklist(csv: string): readonly ProcessEntry[] {
  return csv
    .split(/\r?\n/)
    .map((line) => line.match(/^"([^"]*)","(\d+)"/))
    .filter((match): match is RegExpMatchArray => match !== null)
    .map((match) => ({ image: match[1] as string, pid: Number(match[2]) }))
}

/** The only place a child process is spawned. */
export class TasklistAdapter implements ProcessListPort {
  list(image: string): readonly ProcessEntry[] {
    const csv = execFileSync("tasklist", ["/fo", "csv", "/nh", "/fi", `imagename eq ${image}`], { encoding: "utf8" })
    return parseTasklist(csv).filter((entry) => entry.image.toLowerCase() === image.toLowerCase())
  }
}
