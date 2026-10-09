import { createBrowser, type BrowserState, type OpenedProfile } from "@session-manager/domain/model/Browser"
import { defaultDataHome, profileAt, profileOfFiles, type Profile } from "@session-manager/domain/model/Profile"
import type { OpenProfilePort } from "@session-manager/domain/ports/inbound/OpenProfilePort"
import type { OutputPort } from "@session-manager/domain/ports/outbound/OutputPort"
import type { RuntimePort } from "@session-manager/domain/ports/outbound/RuntimePort"
import type { CliEnvironment } from "@session-manager/infrastructure/adapters/inbound/cli/CompactCliAdapter"

export const TUI_USAGE =
  "usage: opencode-session-manager tui [--left <dataHome> | --left-db <opencode.db> [--left-context <context.db>]] [--right <dataHome> | --right-db <opencode.db> [--right-context <context.db>]]"

const FLAGS = ["--left", "--right", "--left-db", "--right-db", "--left-context", "--right-context"]

export interface BrowseCliOptions {
  readonly profiles: OpenProfilePort
  readonly output: OutputPort
  readonly runtime: RuntimePort
  readonly environment: CliEnvironment
  /** Shows the browser and resolves when the user quits. */
  readonly show: (initial: BrowserState) => Promise<void>
}

/**
 * `tui`: the session browser. Each side is a data home (`--left`, `--right`) or explicit store files
 * (`--left-db` with an optional `--left-context`, likewise for the right); the left defaults to this
 * machine's profile, and a right side adds a second profile beside it. Read-only, so it is safe while OpenCode runs.
 */
export class BrowseCliAdapter {
  private readonly options: BrowseCliOptions

  constructor(options: BrowseCliOptions) {
    this.options = options
  }

  async run(argv: readonly string[]): Promise<number> {
    const { output, runtime, environment, profiles } = this.options
    const values = new Map<string, string>()
    for (let index = 0; index < argv.length; index += 2) {
      const value = argv[index + 1]
      if (!FLAGS.includes(argv[index]!) || value === undefined || value.startsWith("--")) return this.usage()
      values.set(argv[index]!, value)
    }
    const profileFor = (side: "left" | "right"): Profile | null | undefined => {
      const home = values.get(`--${side}`)
      const db = values.get(`--${side}-db`)
      const context = values.get(`--${side}-context`)
      if ((home !== undefined && db !== undefined) || (context !== undefined && db === undefined)) return undefined
      if (db !== undefined) return profileOfFiles(side, db, context)
      if (home !== undefined) return profileAt(side, home)
      return side === "left" ? profileAt(side, defaultDataHome(environment, runtime.homeDirectory())) : null
    }
    const leftProfile = profileFor("left")
    const rightProfile = profileFor("right")
    if (leftProfile === undefined || rightProfile === undefined) return this.usage()
    const opened: OpenedProfile[] = []
    try {
      const left = profiles.open(leftProfile as Profile)
      opened.push(left)
      const right = rightProfile === null ? null : profiles.open(rightProfile)
      if (right !== null) opened.push(right)
      await this.options.show(createBrowser(left, right, 1))
      return 0
    } finally {
      for (const profile of opened) profiles.close(profile)
    }
  }

  private usage(): number {
    this.options.output.line(TUI_USAGE)
    return 2
  }
}
