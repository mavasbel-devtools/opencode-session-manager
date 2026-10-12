import { syncSideOf } from "@session-manager/domain/model/MagicContextSync"
import { defaultDataHome, profileAt } from "@session-manager/domain/model/Profile"
import { relocateLines } from "@session-manager/domain/model/Relocate"
import type { OpenProfilePort } from "@session-manager/domain/ports/inbound/OpenProfilePort"
import type { RelocateSessionsPort } from "@session-manager/domain/ports/inbound/RelocateSessionsPort"
import type { OutputPort } from "@session-manager/domain/ports/outbound/OutputPort"
import type { RuntimePort } from "@session-manager/domain/ports/outbound/RuntimePort"
import { parseMapRule } from "@session-manager/domain/services/MapRules"
import { parseOptions } from "@session-manager/infrastructure/adapters/inbound/cli/arguments"
import type { CliEnvironment } from "@session-manager/infrastructure/adapters/inbound/cli/CompactCliAdapter"

export const RELOCATE_USAGE =
  "usage: opencode-session-manager relocate [--data <dataHome>] --map <from>=<to>... (--session <id>... | --all) [--dry-run] [--json]"

export interface RelocateCliOptions {
  readonly relocate: RelocateSessionsPort
  readonly profiles: OpenProfilePort
  readonly output: OutputPort
  readonly runtime: RuntimePort
  readonly environment: CliEnvironment
}

/**
 * `relocate`: moves the sessions of one profile (`--data`, default `$XDG_DATA_HOME` or
 * `~/.local/share`) whose folders moved, by `--map <from>=<to>` rules between absolute POSIX
 * folders — the sessions with their sub-agent sessions, every text naming an old folder, and their
 * Magic Context state. `--all` moves every session in a mapped folder and rewrites the whole
 * profile's text; `--session` moves those sessions and rewrites only their rows. Prints a summary
 * (`--json`: the report).
 */
export class RelocateCliAdapter {
  constructor(private readonly options: RelocateCliOptions) {}

  run(argv: readonly string[]): number {
    const { output, runtime, environment, profiles } = this.options
    const values = parseOptions(argv, ["--data", "--map", "--session"], ["--all", "--dry-run", "--json"])
    const ids = values?.many.get("--session") ?? []
    const maps = values?.many.get("--map") ?? []
    if (values === null || maps.length === 0 || (ids.length === 0) === !values.flags.has("--all")) {
      output.line(RELOCATE_USAGE)
      return 2
    }
    const rules = maps.map(parseMapRule)
    const opened = profiles.open(profileAt("profile", values.single.get("--data") ?? defaultDataHome(environment, runtime.homeDirectory())))
    try {
      const report = this.options.relocate.relocate({
        profile: syncSideOf(opened),
        maps: rules,
        sessions: values.flags.has("--all") ? "all" : ids,
        dryRun: values.flags.has("--dry-run"),
      })
      if (values.flags.has("--json")) output.line(JSON.stringify(report, null, 2))
      else for (const line of relocateLines(report)) output.line(line)
      return report.failed.length === 0 ? 0 : 1
    } finally {
      profiles.close(opened)
    }
  }
}
