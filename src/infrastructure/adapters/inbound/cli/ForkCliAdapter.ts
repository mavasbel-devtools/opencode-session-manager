import { forkLines } from "@session-manager/domain/model/Fork"
import type { ForkSessionPort } from "@session-manager/domain/ports/inbound/ForkSessionPort"
import type { OutputPort } from "@session-manager/domain/ports/outbound/OutputPort"
import { parseOptions } from "@session-manager/infrastructure/adapters/inbound/cli/arguments"

export const FORK_USAGE = "usage: opencode-session-manager fork --session <id> [--before <messageId>] [--server <url>] [--json]"

export interface ForkCliOptions {
  readonly fork: ForkSessionPort
  readonly output: OutputPort
}

/**
 * `fork`: forks a session through the running OpenCode (its whole history, or the part before
 * `--before`), and prints the new session (`--json`: the report).
 */
export class ForkCliAdapter {
  constructor(private readonly options: ForkCliOptions) {}

  async run(argv: readonly string[]): Promise<number> {
    const { output } = this.options
    const values = parseOptions(argv, ["--session", "--before", "--server"], ["--json"])
    const session = values?.single.get("--session")
    if (values === null || session === undefined || (values.many.get("--session") ?? []).length > 1) {
      output.line(FORK_USAGE)
      return 2
    }
    const report = await this.options.fork.fork({ sessionId: session, before: values.single.get("--before") ?? null, server: values.single.get("--server") ?? null })
    if (values.flags.has("--json")) output.line(JSON.stringify(report, null, 2))
    else for (const line of forkLines(report)) output.line(line)
    return 0
  }
}
