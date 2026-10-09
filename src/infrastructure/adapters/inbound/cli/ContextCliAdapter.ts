import type { OpenedProfile } from "@session-manager/domain/model/Browser"
import { syncSideOf, type SyncRequest } from "@session-manager/domain/model/MagicContextSync"
import { profileAt } from "@session-manager/domain/model/Profile"
import { hasContextState } from "@session-manager/domain/model/SessionCatalog"
import type { CopyMagicContextPort } from "@session-manager/domain/ports/inbound/CopyMagicContextPort"
import type { OpenProfilePort } from "@session-manager/domain/ports/inbound/OpenProfilePort"
import type { SyncMagicContextPort } from "@session-manager/domain/ports/inbound/SyncMagicContextPort"
import type { OutputPort } from "@session-manager/domain/ports/outbound/OutputPort"

export const CONTEXT_USAGE = [
  "usage: opencode-session-manager context copy --from <context.db> --to <file>",
  "       opencode-session-manager context sync --from <dataHome> --to <dataHome> (--session <id>... | --all) [--replace] [--dry-run]",
].join("\n")

export interface ContextCliOptions {
  readonly copy: CopyMagicContextPort
  readonly sync: SyncMagicContextPort
  readonly profiles: OpenProfilePort
  readonly output: OutputPort
}

/**
 * `context copy`: a copy of a Magic Context store, upgraded to the format the installed Magic
 * Context writes; the source is only read, so it is safe while OpenCode runs.
 * `context sync`: copies sessions' Magic Context state from one profile to another, for sessions
 * both hold; `--all` takes every such session the source has state for. A session the target already
 * has state for is replaced only with `--replace`. `--dry-run` builds and checks the result without
 * touching the target.
 */
export class ContextCliAdapter {
  private readonly options: ContextCliOptions

  constructor(options: ContextCliOptions) {
    this.options = options
  }

  run(argv: readonly string[]): number {
    if (argv[0] === "copy") return this.copy(argv.slice(1))
    if (argv[0] === "sync") return this.sync(argv.slice(1))
    return this.usage()
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
    const values = parse(argv, ["--from", "--to", "--session"], ["--all", "--replace", "--dry-run"])
    const from = values?.single.get("--from")
    const to = values?.single.get("--to")
    const ids = values?.many.get("--session") ?? []
    const all = values?.flags.has("--all") === true
    if (values === null || from === undefined || to === undefined || (ids.length === 0) === !all) return this.usage()
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
      const resolution = values.flags.has("--replace") ? "replace" : "skip"
      const sessions: SyncRequest[] = chosen.map((id) => ({ id, resolution }))
      const report = this.options.sync.sync({
        source: syncSideOf(source),
        target: syncSideOf(target),
        sessions,
        dryRun: values.flags.has("--dry-run"),
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

interface Parsed {
  readonly single: Map<string, string>
  readonly many: Map<string, string[]>
  readonly flags: Set<string>
}

/** `--name value` options (the last one wins, or all are kept for `--session`) and bare flags; null on anything else. */
function parse(argv: readonly string[], withValue: readonly string[], bare: readonly string[]): Parsed | null {
  const parsed: Parsed = { single: new Map(), many: new Map(), flags: new Set() }
  for (let index = 0; index < argv.length; index++) {
    const name = argv[index]!
    if (bare.includes(name)) {
      parsed.flags.add(name)
      continue
    }
    const value = argv[index + 1]
    if (!withValue.includes(name) || value === undefined || value.startsWith("--")) return null
    parsed.single.set(name, value)
    parsed.many.set(name, [...(parsed.many.get(name) ?? []), value])
    index++
  }
  return parsed
}
