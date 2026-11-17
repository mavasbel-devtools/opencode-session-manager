import { execFile } from "node:child_process"
import { promisify } from "node:util"
import type { NotifierPort } from "@session-manager/domain/ports/outbound/NotifierPort"

const run = promisify(execFile)

/** Desktop notifications through `notify-send` (libnotify). */
export class NotifySendAdapter implements NotifierPort {
  constructor(private readonly command: string) {}

  async notify(title: string, body: string): Promise<void> {
    await run(this.command, ["--app-name=opencode-session-manager", "--urgency=normal", "--icon=dialog-warning", title, body])
  }
}
