import { defaultDataHome, profileAt } from "@session-manager/domain/model/Profile"
import type { CatalogedSession, ProfileCatalog } from "@session-manager/domain/model/SessionCatalog"
import type { CatalogProfilePort } from "@session-manager/domain/ports/inbound/CatalogProfilePort"
import type { OutputPort } from "@session-manager/domain/ports/outbound/OutputPort"
import type { RuntimePort } from "@session-manager/domain/ports/outbound/RuntimePort"
import type { CliEnvironment } from "@session-manager/infrastructure/adapters/inbound/cli/CompactCliAdapter"

export const SESSIONS_USAGE = "usage: opencode-session-manager sessions [--data <dataHome>] [--json]"

export interface SessionsCliOptions {
  readonly catalog: CatalogProfilePort
  readonly output: OutputPort
  readonly runtime: RuntimePort
  readonly environment: CliEnvironment
}

/**
 * `sessions`: one profile's sessions, newest first, with what Magic Context holds for each.
 * `--data` names the profile's XDG data home (default `$XDG_DATA_HOME`, else `~/.local/share`).
 * Read-only, so it is safe while OpenCode runs.
 */
export class SessionsCliAdapter {
  private readonly options: SessionsCliOptions

  constructor(options: SessionsCliOptions) {
    this.options = options
  }

  run(argv: readonly string[]): number {
    const { output, runtime, environment } = this.options
    let dataHome: string | undefined
    let json = false
    for (let index = 0; index < argv.length; index++) {
      const token = argv[index]
      if (token === "--data" && argv[index + 1] !== undefined && !argv[index + 1]!.startsWith("--")) dataHome = argv[++index]
      else if (token === "--json") json = true
      else {
        output.line(SESSIONS_USAGE)
        return 2
      }
    }
    const profile = profileAt("profile", dataHome ?? defaultDataHome(environment, runtime.homeDirectory()))
    const catalog = this.options.catalog.catalog(profile)
    if (json) output.line(JSON.stringify(catalog, null, 2))
    else for (const line of render(catalog)) output.line(line)
    return 0
  }
}

function render(catalog: ProfileCatalog): string[] {
  const context = catalog.magicContext.available
    ? `Magic Context format ${catalog.magicContext.schemaVersion ?? "unknown"}`
    : "no Magic Context store"
  return [
    `opencode.db: ${catalog.profile.opencodeDb} (${catalog.sessions.length} sessions)`,
    `context.db: ${catalog.profile.contextDb} (${context})`,
    ["ID", "GEN", "ENTRIES", "SUMMARIES", "TAGS", "UPDATED", "DIRECTORY", "TITLE"].join("\t"),
    ...catalog.sessions.map(row),
  ]
}

function row(session: CatalogedSession): string {
  const context = session.magicContext
  return [
    session.id,
    session.generation,
    String(session.entries),
    context === null ? "-" : String(context.compartments),
    context === null ? "-" : String(context.tags),
    new Date(session.timeUpdated).toISOString().slice(0, 16).replace("T", " "),
    session.directory,
    session.title ?? "",
  ].join("\t")
}
