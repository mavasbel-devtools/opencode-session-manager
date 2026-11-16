import { worktreeAllowsMove, worktreeNoteworthy, type WorktreeLinkOutcome } from "@session-manager/domain/model/GitWorktree"
import { syncSideOf } from "@session-manager/domain/model/MagicContextSync"
import { defaultDataHome, profileAt } from "@session-manager/domain/model/Profile"
import { relocateLines, type RelocateReport } from "@session-manager/domain/model/Relocate"
import type { OpenProfilePort } from "@session-manager/domain/ports/inbound/OpenProfilePort"
import type { RelocateSessionsPort } from "@session-manager/domain/ports/inbound/RelocateSessionsPort"
import type { RepairWorktreeLinksPort } from "@session-manager/domain/ports/inbound/RepairWorktreeLinksPort"
import type { LocationRepairMappingsPort } from "@session-manager/domain/ports/outbound/LocationRepairMappingsPort"
import type { OutputPort } from "@session-manager/domain/ports/outbound/OutputPort"
import type { RuntimePort } from "@session-manager/domain/ports/outbound/RuntimePort"
import { parseMapRule } from "@session-manager/domain/services/MapRules"
import { withConfiguredRules } from "@session-manager/domain/services/RelocateRules"
import { parseOptions } from "@session-manager/infrastructure/adapters/inbound/cli/arguments"
import type { CliEnvironment } from "@session-manager/infrastructure/adapters/inbound/cli/CompactCliAdapter"

export const RELOCATE_USAGE =
  "usage: opencode-session-manager relocate [--data <dataHome>] (--map <from>=<to> | --rename <folder>=<name> | --relink | --configured)... (--session <id>... | --all) [--repair-worktrees] [--dry-run] [--json]"

export interface RelocateCliOptions {
  readonly relocate: RelocateSessionsPort
  readonly profiles: OpenProfilePort
  readonly output: OutputPort
  readonly runtime: RuntimePort
  readonly environment: CliEnvironment
  /** The plugin's `location_repair` mappings, for `--configured`. */
  readonly mappings: LocationRepairMappingsPort
  /** Git work tree links of the moved folders, for `--repair-worktrees`. */
  readonly worktrees: RepairWorktreeLinksPort
}

/**
 * `relocate`: moves the sessions of one profile (`--data`, default `$XDG_DATA_HOME` or
 * `~/.local/share`) whose folders moved, by `--map <from>=<to>` rules between absolute POSIX
 * folders — the sessions with their sub-agent sessions, every text naming an old folder, and their
 * Magic Context state — and by `--rename <folder>=<name>` rules for folders renamed in place, whose
 * old name is also replaced wherever it stands as a whole name (relative paths, ids, prose); `--relink` also
 * takes sessions already in their folder whose Magic Context project is another one, linking them to their folder's and merging that project into it. `--all` moves every session in a mapped folder and rewrites the whole
 * profile's text; `--session` moves those sessions and rewrites only their rows. Prints a summary
 * (`--json`: the report).
 *
 * `--configured` adds the plugin's `location_repair` mappings (`session-manager.jsonc`) before the
 * `--map` rules, so the offline and online repairs share one source of truth. `--repair-worktrees`
 * then proves and runs `git worktree repair` for the folders the sessions moved to (planned only in a
 * dry run); a work tree Git cannot resolve afterwards fails the command.
 */
export class RelocateCliAdapter {
  constructor(private readonly options: RelocateCliOptions) {}

  run(argv: readonly string[]): number {
    const { output, runtime, environment, profiles } = this.options
    const values = parseOptions(argv, ["--data", "--map", "--rename", "--session"], ["--all", "--dry-run", "--json", "--relink", "--configured", "--repair-worktrees"])
    const ids = values?.many.get("--session") ?? []
    const maps = values?.many.get("--map") ?? []
    const renames = values?.many.get("--rename") ?? []
    if (values === null || (maps.length + renames.length === 0 && !values.flags.has("--relink") && !values.flags.has("--configured")) || (ids.length === 0) === !values.flags.has("--all")) {
      output.line(RELOCATE_USAGE)
      return 2
    }
    const explicit = maps.map(parseMapRule)
    const rules = values.flags.has("--configured") ? withConfiguredRules(this.options.mappings.mappings(), explicit) : explicit
    const opened = profiles.open(profileAt("profile", values.single.get("--data") ?? defaultDataHome(environment, runtime.homeDirectory())))
    try {
      const report = this.options.relocate.relocate({
        profile: syncSideOf(opened),
        maps: rules,
        renames: renames.map(parseMapRule),
        sessions: values.flags.has("--all") ? "all" : ids,
        relink: values.flags.has("--relink"),
        dryRun: values.flags.has("--dry-run"),
      })
      const worktrees = values.flags.has("--repair-worktrees") && report.failed.length === 0 ? this.repairWorktrees(report.sessions.map((session) => session.to_directory), report) : null
      if (values.flags.has("--json")) output.line(JSON.stringify(worktrees === null ? report : { ...report, worktrees }, null, 2))
      else for (const line of [...relocateLines(report), ...(worktrees ?? []).map(worktreeLine)]) output.line(line)
      return report.failed.length === 0 && (worktrees ?? []).every(worktreeAllowsMove) ? 0 : 1
    } finally {
      profiles.close(opened)
    }
  }

  /** Each moved-to folder once, each work tree reported once; only the work trees worth reporting. */
  private repairWorktrees(directories: readonly string[], report: RelocateReport): WorktreeLinkOutcome[] {
    const roots = new Set<string | null>()
    const outcomes: WorktreeLinkOutcome[] = []
    for (const directory of new Set(directories)) {
      const outcome = this.options.worktrees.ensure(directory, report.rules, report.dry_run)
      if (!worktreeNoteworthy(outcome) || roots.has(outcome.root)) continue
      roots.add(outcome.root)
      outcomes.push(outcome)
    }
    return outcomes
  }
}

function worktreeLine(outcome: WorktreeLinkOutcome): string {
  const command = outcome.command === null ? "" : ` (git -C ${outcome.command.cwd} worktree repair${outcome.command.paths.map((entry) => ` ${entry}`).join("")})`
  return `Work tree ${outcome.root}: ${outcome.status}${command}`
}
