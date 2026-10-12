import type { OutputPort } from "@session-manager/domain/ports/outbound/OutputPort"

export const HELP = [
  "opencode-session-manager: browse, sync and maintain OpenCode sessions and their Magic Context state",
  "",
  "  tui [--left <dataHome>] [--right <dataHome>]   session browser: both sides matched by session id",
  "      (or --left-db/--right-db <opencode.db> with --left-context/--right-context <context.db>)",
  "  sessions [--data <dataHome>] [--json]          list a profile's sessions with their Magic Context state",
  "  verify [--data <dataHome>] [--session <id>]... [--behind <messages>] [--json]",
  "                                                 check a profile's stores and sessions (read-only)",
  "  context copy --from <context.db> --to <file>   copy a Magic Context store in the installed format",
  "  sync --from <dataHome> --to <dataHome> [--map <from>=<to>]... (--session <id>... | --all)",
  "       [--prefer further|keep|replace] [--context all|sessions] [--strict] [--dry-run]",
  "                                                 copy whole sessions and their Magic Context state (OpenCode closed)",
  "  context sync --from <dataHome> --to <dataHome> (--session <id>... | --all)",
  "       [--prefer keep|further|replace] [--context all|sessions] [--strict] [--dry-run]",
  "                                                 copy only sessions' Magic Context state between profiles",
  "  preflight|rehearse|run [--db <path>] [--keep]  verified compaction of opencode.db (OpenCode closed)",
  "  rollback <backupDir> [--db <path>]...          restore the originals a run or a sync moved aside",
  "  --version, --help",
  "",
  "A <dataHome> holds opencode/opencode.db and cortexkit/magic-context/context.db (default: $XDG_DATA_HOME or ~/.local/share).",
] as const

/** `--version` and `--help` (also `version` and `help`). */
export class HelpCliAdapter {
  private readonly output: OutputPort
  private readonly version: string

  constructor(output: OutputPort, version: string) {
    this.output = output
    this.version = version
  }

  run(argv: readonly string[], mode: "help" | "version"): number {
    if (mode === "version" && argv.length === 0) {
      this.output.line(`opencode-session-manager ${this.version}`)
      return 0
    }
    for (const line of HELP) this.output.line(line)
    return argv.length === 0 ? 0 : 2
  }
}
