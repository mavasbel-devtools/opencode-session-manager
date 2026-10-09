import type { OpenedProfile } from "@session-manager/domain/model/Browser"
import { syncSideOf } from "@session-manager/domain/model/MagicContextSync"
import { profileAt } from "@session-manager/domain/model/Profile"
import { isPrefer } from "@session-manager/domain/model/SessionSync"
import type { OpenProfilePort } from "@session-manager/domain/ports/inbound/OpenProfilePort"
import type { SyncSessionsPort } from "@session-manager/domain/ports/inbound/SyncSessionsPort"
import type { OutputPort } from "@session-manager/domain/ports/outbound/OutputPort"
import { parseMapRule } from "@session-manager/domain/services/MapRules"
import { parseOptions } from "@session-manager/infrastructure/adapters/inbound/cli/arguments"

export const SYNC_USAGE =
  "usage: opencode-session-manager sync --from <dataHome> --to <dataHome> [--map <from>=<to>]... (--session <id>... | --all) [--prefer further|keep|replace] [--dry-run]"

export interface SyncCliOptions {
  readonly sync: SyncSessionsPort
  readonly profiles: OpenProfilePort
  readonly output: OutputPort
}

/**
 * `sync`: copies whole sessions — OpenCode rows with their sub-agent sessions, and their Magic
 * Context state — from one profile to another, with paths rewritten by `--map` rules (by default
 * the Windows profile the sessions live in maps to this home). `--all` takes every root session of
 * the source. `--prefer` decides Magic Context state for sessions both sides already have (default
 * `further`). Prints the JSON report.
 */
export class SyncCliAdapter {
  private readonly options: SyncCliOptions

  constructor(options: SyncCliOptions) {
    this.options = options
  }

  run(argv: readonly string[]): number {
    const values = parseOptions(argv, ["--from", "--to", "--session", "--map", "--prefer"], ["--all", "--dry-run"])
    const from = values?.single.get("--from")
    const to = values?.single.get("--to")
    const ids = values?.many.get("--session") ?? []
    const all = values?.flags.has("--all") === true
    const prefer = values?.single.get("--prefer") ?? "further"
    if (values === null || from === undefined || to === undefined || (ids.length === 0) === !all || !isPrefer(prefer)) {
      this.options.output.line(SYNC_USAGE)
      return 2
    }
    const maps = (values.many.get("--map") ?? []).map(parseMapRule)
    const { profiles } = this.options
    const opened: OpenedProfile[] = []
    try {
      const source = profiles.open(profileAt("from", from))
      opened.push(source)
      const target = profiles.open(profileAt("to", to))
      opened.push(target)
      const report = this.options.sync.sync({
        source: syncSideOf(source),
        target: syncSideOf(target),
        sessions: all ? "all" : ids,
        maps,
        prefer,
        dryRun: values.flags.has("--dry-run"),
      })
      this.options.output.line(JSON.stringify(report, null, 2))
      return 0
    } finally {
      for (const profile of opened) profiles.close(profile)
    }
  }
}
