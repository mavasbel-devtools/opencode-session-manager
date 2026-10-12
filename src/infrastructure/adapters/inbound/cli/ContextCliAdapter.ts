import type { OpenedProfile } from "@session-manager/domain/model/Browser"
import { isContextScope, syncSideOf, type Resolution, type SyncRequest } from "@session-manager/domain/model/MagicContextSync"
import { isPrefer, type Prefer } from "@session-manager/domain/model/SessionSync"
import { defaultDataHome, profileAt } from "@session-manager/domain/model/Profile"
import {
  isRebuildCommand,
  progressText,
  REBUILD_GRACE_MS,
  REBUILD_POLL_MS,
  REBUILD_TIMEOUT_MINUTES,
  rebuildLines,
  type RebuildCommand,
  type RebuildProgress,
} from "@session-manager/domain/model/Rebuild"
import type { RebuildContextPort } from "@session-manager/domain/ports/inbound/RebuildContextPort"
import type { RuntimePort } from "@session-manager/domain/ports/outbound/RuntimePort"
import type { CliEnvironment } from "@session-manager/infrastructure/adapters/inbound/cli/CompactCliAdapter"
import { hasContextState } from "@session-manager/domain/model/SessionCatalog"
import type { CopyMagicContextPort } from "@session-manager/domain/ports/inbound/CopyMagicContextPort"
import type { OpenProfilePort } from "@session-manager/domain/ports/inbound/OpenProfilePort"
import type { SyncMagicContextPort } from "@session-manager/domain/ports/inbound/SyncMagicContextPort"
import type { OutputPort } from "@session-manager/domain/ports/outbound/OutputPort"
import { parseOptions as parse } from "@session-manager/infrastructure/adapters/inbound/cli/arguments"

export const CONTEXT_USAGE = [
  "usage: opencode-session-manager context copy --from <context.db> --to <file>",
  "       opencode-session-manager context sync --from <dataHome> --to <dataHome> (--session <id>... | --all) [--prefer keep|further|replace | --replace] [--context all|sessions] [--strict] [--dry-run]",
  "       opencode-session-manager context wrapup|recomp --session <id>... [--data <dataHome>] [--keep <messages>] [--server <url>] [--no-wait] [--timeout <minutes>] [--json]",
].join("\n")


const RESOLUTION: Readonly<Record<Prefer, Resolution>> = { keep: "skip", further: "further", replace: "replace" }

export interface ContextCliOptions {
  readonly copy: CopyMagicContextPort
  readonly sync: SyncMagicContextPort
  readonly rebuild: RebuildContextPort
  readonly profiles: OpenProfilePort
  readonly output: OutputPort
  readonly runtime: Pick<RuntimePort, "homeDirectory">
  readonly environment: CliEnvironment
}

/**
 * `context copy`: a copy of a Magic Context store, upgraded to the format the installed Magic
 * Context writes; the source is only read, so it is safe while OpenCode runs.
 * `context sync`: copies sessions' Magic Context state from one profile to another, for sessions
 * both hold; `--all` takes every such session the source has state for. A session the target already
 * has state for keeps it unless `--prefer replace` (or `--replace`), or `--prefer further` when the
 * source's summaries reach further. `--dry-run` builds and checks the result without touching the
 * target.
 * `context wrapup` / `context recomp`: runs Magic Context's `/ctx-wrapup` or `/ctx-recomp` in each
 * session through the running OpenCode server, one at a time, and follows it in the store (this
 * machine's profile, or `--data`); `--no-wait` starts them and returns.
 */
export class ContextCliAdapter {
  private readonly options: ContextCliOptions

  constructor(options: ContextCliOptions) {
    this.options = options
  }

  run(argv: readonly string[]): number | Promise<number> {
    if (argv[0] === "copy") return this.copy(argv.slice(1))
    if (argv[0] === "sync") return this.sync(argv.slice(1))
    if (argv[0] !== undefined && isRebuildCommand(argv[0])) return this.rebuild(argv[0], argv.slice(1))
    return this.usage()
  }

  private async rebuild(command: RebuildCommand, argv: readonly string[]): Promise<number> {
    const values = parse(argv, ["--session", "--data", "--keep", "--server", "--timeout"], ["--no-wait", "--json"])
    const ids = values?.many.get("--session") ?? []
    const keep = values?.single.get("--keep")
    const timeout = values?.single.get("--timeout") ?? String(REBUILD_TIMEOUT_MINUTES)
    const whole = (text: string | undefined) => text !== undefined && /^\d+$/.test(text)
    if (values === null || ids.length === 0 || (keep !== undefined && (command !== "wrapup" || !whole(keep))) || !whole(timeout) || Number(timeout) === 0) return this.usage()
    const { output, runtime, environment } = this.options
    const json = values.flags.has("--json")
    const dataHome = values.single.get("--data") ?? defaultDataHome(environment, runtime.homeDirectory())
    const report = await this.options.rebuild.rebuild({
      contextDb: profileAt("live", dataHome).contextDb,
      sessions: ids,
      command,
      keep: keep === undefined ? null : Number(keep),
      server: values.single.get("--server") ?? null,
      wait: !values.flags.has("--no-wait"),
      timeoutMs: Number(timeout) * 60_000,
      pollMs: REBUILD_POLL_MS,
      graceMs: REBUILD_GRACE_MS,
      ...(json ? {} : { onProgress: (progress: RebuildProgress) => output.line(progressText(progress)) }),
    })
    if (json) output.line(JSON.stringify(report, null, 2))
    else for (const line of rebuildLines(report)) output.line(line)
    return report.ok ? 0 : 1
  }

  private copy(argv: readonly string[]): number {
    const values = parse(argv, ["--from", "--to"], [])
    const source = values?.single.get("--from")
    const target = values?.single.get("--to")
    if (source === undefined || target === undefined) return this.usage()
    this.options.output.line(JSON.stringify(this.options.copy.copy({ source, target }), null, 2))
    return 0
  }

  private sync(argv: readonly string[]): number {
    const values = parse(argv, ["--from", "--to", "--session", "--prefer", "--context"], ["--all", "--replace", "--dry-run", "--strict"])
    const from = values?.single.get("--from")
    const to = values?.single.get("--to")
    const ids = values?.many.get("--session") ?? []
    const all = values?.flags.has("--all") === true
    const prefer = values?.flags.has("--replace") === true ? "replace" : (values?.single.get("--prefer") ?? "keep")
    const scope = values?.single.get("--context") ?? "all"
    if (values === null || from === undefined || to === undefined || (ids.length === 0) === !all || !isPrefer(prefer) || !isContextScope(scope)) return this.usage()
    const { profiles } = this.options
    const opened: OpenedProfile[] = []
    try {
      const source = profiles.open(profileAt("from", from))
      opened.push(source)
      const target = profiles.open(profileAt("to", to))
      opened.push(target)
      const onTarget = new Set(target.catalog.sessions.map((session) => session.id))
      const chosen = all
        ? [...new Set(source.catalog.sessions.filter((session) => hasContextState(session.magicContext) && onTarget.has(session.id)).map((session) => session.id))]
        : ids
      const resolution = RESOLUTION[prefer]
      const sessions: SyncRequest[] = chosen.map((id) => ({ id, resolution }))
      const report = this.options.sync.sync({
        source: syncSideOf(source),
        target: syncSideOf(target),
        sessions,
        scope,
        dryRun: values.flags.has("--dry-run"),
        strict: values.flags.has("--strict"),
      })
      this.options.output.line(JSON.stringify(report, null, 2))
      return 0
    } finally {
      for (const profile of opened) profiles.close(profile)
    }
  }

  private usage(): number {
    this.options.output.line(CONTEXT_USAGE)
    return 2
  }
}
