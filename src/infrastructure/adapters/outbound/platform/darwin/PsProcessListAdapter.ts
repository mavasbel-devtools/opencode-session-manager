import { spawnSync } from "node:child_process"
import { basename } from "node:path"
import type { ProcessEntry } from "@session-manager/domain/model/Database"
import type { ProcessListPort } from "@session-manager/domain/ports/outbound/ProcessListPort"

/** Reads `ps -axo pid=,comm=` rows of the shape `<pid> <comm>`, ignoring malformed lines. */
export function parsePs(output: string): readonly { pid: number; comm: string }[] {
  return output
    .split("\n")
    .map((line) => line.match(/^\s*(\d+)\s+(.+?)\s*$/))
    .filter((match): match is RegExpMatchArray => match !== null)
    .map((match) => ({ pid: Number(match[1]), comm: match[2] as string }))
}

/**
 * macOS: the running processes whose `ps` `comm` names the image. `comm` is the executable's
 * full path here (measured: `/opt/homebrew/Cellar/opencode/2.3.0/bin/opencode`), so the match
 * is on its basename, which a bare `opencode` process name meets too. The executable is a
 * constructor argument so the adapter can be exercised against a stand-in off macOS.
 */
export class PsProcessListAdapter implements ProcessListPort {
  private readonly psPath: string

  constructor(psPath: string) {
    this.psPath = psPath
  }

  list(image: string): readonly ProcessEntry[] {
    const run = spawnSync(this.psPath, ["-axo", "pid=,comm="], {
      encoding: "utf8",
      env: { ...process.env, LC_ALL: "C" },
    })
    if (run.error) throw run.error
    return parsePs(run.stdout ?? "").filter((row) => basename(row.comm) === image).map((row) => ({ image, pid: row.pid }))
  }
}
