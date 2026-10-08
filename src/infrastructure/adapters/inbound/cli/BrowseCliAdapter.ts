import { createBrowser, type BrowserState, type OpenedProfile } from "@session-manager/domain/model/Browser"
import { defaultDataHome } from "@session-manager/domain/model/Profile"
import type { OpenProfilePort } from "@session-manager/domain/ports/inbound/OpenProfilePort"
import type { OutputPort } from "@session-manager/domain/ports/outbound/OutputPort"
import type { RuntimePort } from "@session-manager/domain/ports/outbound/RuntimePort"
import type { CliEnvironment } from "@session-manager/infrastructure/adapters/inbound/cli/CompactCliAdapter"

export const TUI_USAGE = "usage: opencode-session-manager tui [--left <dataHome>] [--right <dataHome>]"

export interface BrowseCliOptions {
  readonly profiles: OpenProfilePort
  readonly output: OutputPort
  readonly runtime: RuntimePort
  readonly environment: CliEnvironment
  /** Shows the browser and resolves when the user quits. */
  readonly show: (initial: BrowserState) => Promise<void>
}

/**
 * `tui`: the session browser. The left pane is `--left` (default: this machine's profile); `--right`
 * adds a second profile beside it. Read-only, so it is safe while OpenCode runs.
 */
export class BrowseCliAdapter {
  private readonly options: BrowseCliOptions

  constructor(options: BrowseCliOptions) {
    this.options = options
  }

  async run(argv: readonly string[]): Promise<number> {
    const { output, runtime, environment, profiles } = this.options
    const homes = new Map<string, string>()
    for (let index = 0; index < argv.length; index += 2) {
      const value = argv[index + 1]
      if (!["--left", "--right"].includes(argv[index]!) || value === undefined || value.startsWith("--")) {
        output.line(TUI_USAGE)
        return 2
      }
      homes.set(argv[index]!, value)
    }
    const opened: OpenedProfile[] = []
    try {
      const left = profiles.open("left", homes.get("--left") ?? defaultDataHome(environment, runtime.homeDirectory()))
      opened.push(left)
      const rightHome = homes.get("--right")
      const right = rightHome === undefined ? null : profiles.open("right", rightHome)
      if (right !== null) opened.push(right)
      await this.options.show(createBrowser(left, right, 1))
      return 0
    } finally {
      for (const profile of opened) profiles.close(profile)
    }
  }
}
