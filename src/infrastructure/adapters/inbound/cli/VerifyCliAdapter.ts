import { syncSideOf } from "@session-manager/domain/model/MagicContextSync"
import { defaultDataHome, profileAt } from "@session-manager/domain/model/Profile"
import { DEFAULT_BEHIND, verifyLines } from "@session-manager/domain/model/Verify"
import type { OpenProfilePort } from "@session-manager/domain/ports/inbound/OpenProfilePort"
import type { VerifyProfilePort } from "@session-manager/domain/ports/inbound/VerifyProfilePort"
import type { OutputPort } from "@session-manager/domain/ports/outbound/OutputPort"
import type { RuntimePort } from "@session-manager/domain/ports/outbound/RuntimePort"
import { parseOptions } from "@session-manager/infrastructure/adapters/inbound/cli/arguments"
import type { CliEnvironment } from "@session-manager/infrastructure/adapters/inbound/cli/CompactCliAdapter"

export const VERIFY_USAGE = "usage: opencode-session-manager verify [--data <dataHome>] [--session <id>]... [--behind <messages>] [--json]"

export interface VerifyCliOptions {
  readonly verify: VerifyProfilePort
  readonly profiles: OpenProfilePort
  readonly output: OutputPort
  readonly runtime: RuntimePort
  readonly environment: CliEnvironment
}

/**
 * `verify`: checks one profile (`--data`, default `$XDG_DATA_HOME` or `~/.local/share`) — both
 * stores, and every session or the `--session`s named — and prints the findings (`--json`: the
 * report). Read-only, so it is safe while OpenCode runs. Exits 1 when there is an error-level finding.
 */
export class VerifyCliAdapter {
  private readonly options: VerifyCliOptions

  constructor(options: VerifyCliOptions) {
    this.options = options
  }

  run(argv: readonly string[]): number {
    const { output, runtime, environment, profiles } = this.options
    const values = parseOptions(argv, ["--data", "--session", "--behind"], ["--json"])
    const behind = Number(values?.single.get("--behind") ?? DEFAULT_BEHIND)
    if (values === null || !Number.isInteger(behind) || behind < 0) {
      output.line(VERIFY_USAGE)
      return 2
    }
    const ids = values.many.get("--session") ?? []
    const opened = profiles.open(profileAt("profile", values.single.get("--data") ?? defaultDataHome(environment, runtime.homeDirectory())))
    try {
      const report = this.options.verify.verify({ ...syncSideOf(opened), sessions: ids.length === 0 ? "all" : ids, behind }, opened.catalog)
      if (values.flags.has("--json")) output.line(JSON.stringify(report, null, 2))
      else for (const line of verifyLines(report)) output.line(line)
      return report.ok ? 0 : 1
    } finally {
      profiles.close(opened)
    }
  }
}
