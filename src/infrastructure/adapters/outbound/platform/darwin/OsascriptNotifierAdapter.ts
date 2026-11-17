import { execFile } from "node:child_process"
import { promisify } from "node:util"
import type { NotifierPort } from "@session-manager/domain/ports/outbound/NotifierPort"

const run = promisify(execFile)

const escape = (text: string) => text.replace(/\\/g, "\\\\").replace(/"/g, '\\"')

/**
 * `NotifierPort` on macOS: `osascript -e 'display notification … with title …'`. The executable
 * is a constructor argument so the adapter can be exercised against a stand-in off macOS.
 */
export class OsascriptNotifierAdapter implements NotifierPort {
  constructor(private readonly osascript: string) {}

  async notify(title: string, body: string): Promise<void> {
    await run(this.osascript, ["-e", `display notification "${escape(body)}" with title "${escape(title)}"`])
  }
}
