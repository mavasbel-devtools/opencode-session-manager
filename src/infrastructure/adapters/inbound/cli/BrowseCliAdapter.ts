import { createBrowser, type BrowserState, type OpenedProfile } from "@session-manager/domain/model/Browser"
import { defaultDataHome, profileAt, profileOfFiles, type Profile } from "@session-manager/domain/model/Profile"
import type { ApplyQueuePort } from "@session-manager/domain/ports/inbound/ApplyQueuePort"
import type { OpenProfilePort } from "@session-manager/domain/ports/inbound/OpenProfilePort"
import type { VerifyProfilePort } from "@session-manager/domain/ports/inbound/VerifyProfilePort"
import type { MagicContextVersionsPort } from "@session-manager/domain/ports/inbound/MagicContextVersionsPort"
import type { RebuildContextPort } from "@session-manager/domain/ports/inbound/RebuildContextPort"
import { progressText, REBUILD_GRACE_MS, REBUILD_POLL_MS, REBUILD_TIMEOUT_MINUTES, rebuildLines } from "@session-manager/domain/model/Rebuild"
import { syncSideOf } from "@session-manager/domain/model/MagicContextSync"
import { DEFAULT_BEHIND, healthBySession } from "@session-manager/domain/model/Verify"
import type { OutputPort } from "@session-manager/domain/ports/outbound/OutputPort"
import type { MapRule } from "@session-manager/domain/model/SessionSync"
import { parseMapRule } from "@session-manager/domain/services/MapRules"
import type { RuntimePort } from "@session-manager/domain/ports/outbound/RuntimePort"
import type { CliEnvironment } from "@session-manager/infrastructure/adapters/inbound/cli/CompactCliAdapter"
import type { BrowserControls } from "@session-manager/infrastructure/adapters/inbound/manager-tui/controls"

export const TUI_USAGE =
  "usage: opencode-session-manager tui [--left <dataHome> | --left-db <opencode.db> [--left-context <context.db>]] [--right <dataHome> | --right-db <opencode.db> [--right-context <context.db>]] [--map <from>=<to>]... [--offline]"

const FLAGS = ["--left", "--right", "--left-db", "--right-db", "--left-context", "--right-context"]

export interface BrowseCliOptions {
  readonly profiles: OpenProfilePort
  readonly output: OutputPort
  readonly runtime: RuntimePort
  readonly environment: CliEnvironment
  readonly apply: ApplyQueuePort
  /** Each side's health, shown per session: checked when a side is opened or read again. */
  readonly verify: VerifyProfilePort
  /** The Magic Context this machine runs, and the newest on npm (not asked with `--offline`). */
  readonly versions: MagicContextVersionsPort
  /** `/ctx-wrapup` and `/ctx-recomp` through the running OpenCode, on this machine's own profile only. */
  readonly rebuild: RebuildContextPort
  /** Shows the browser and resolves when the user quits. */
  readonly show: (initial: BrowserState, controls: BrowserControls) => Promise<void>
}

/**
 * `tui`: the session browser. Each side is a data home (`--left`, `--right`) or explicit store files
 * (`--left-db` with an optional `--left-context`, likewise for the right); the left defaults to this
 * machine's profile, and a right side adds a second profile beside it. Browsing only reads, so it is
 * safe while OpenCode runs; applying the queue syncs whole sessions (OpenCode closed), with `--map`
 * rules as for `sync`.
 */
export class BrowseCliAdapter {
  private readonly options: BrowseCliOptions

  constructor(options: BrowseCliOptions) {
    this.options = options
  }

  async run(argv: readonly string[]): Promise<number> {
    const { output, runtime, environment, profiles } = this.options
    const values = new Map<string, string>()
    const maps: MapRule[] = []
    const offline = argv.includes("--offline")
    argv = argv.filter((argument) => argument !== "--offline")
    for (let index = 0; index < argv.length; index += 2) {
      const value = argv[index + 1]
      if (![...FLAGS, "--map"].includes(argv[index]!) || value === undefined || value.startsWith("--")) return this.usage()
      if (argv[index] === "--map") maps.push(parseMapRule(value))
      else values.set(argv[index]!, value)
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
    const shown: { left?: OpenedProfile; right?: OpenedProfile } = {}
    const applied: string[] = []
    const local = this.options.versions.local()
    const live = defaultDataHome(environment, runtime.homeDirectory())
    const checked = (opened: OpenedProfile): OpenedProfile => ({
      ...opened,
      health: healthBySession(this.options.verify.verify({ ...syncSideOf(opened), sessions: "all", behind: DEFAULT_BEHIND }, opened.catalog)),
    })
    try {
      shown.left = profiles.open(leftProfile as Profile)
      shown.left = checked(shown.left)
      if (rightProfile !== null) {
        shown.right = profiles.open(rightProfile)
        shown.right = checked(shown.right)
      }
      const controls: BrowserControls = {
        rebuild: async (request, onProgress) => {
          const opened = shown[request.side]!
          if (opened.catalog.profile.dataHome !== live || opened.snapshot !== null)
            return { result: [`/ctx-${request.command} runs through this machine's OpenCode: only for the side showing ${live}.`] }
          try {
            const report = await this.options.rebuild.rebuild({
              contextDb: opened.catalog.profile.contextDb,
              sessions: request.ids,
              command: request.command,
              keep: null,
              server: null,
              wait: true,
              timeoutMs: REBUILD_TIMEOUT_MINUTES * 60_000,
              pollMs: REBUILD_POLL_MS,
              graceMs: REBUILD_GRACE_MS,
              onProgress: (progress) => onProgress(progressText(progress)),
            })
            const fresh = checked(profiles.open(opened.catalog.profile))
            profiles.close(opened)
            shown[request.side] = fresh
            const lines = rebuildLines(report)
            applied.push(...lines)
            return { result: lines, [request.side]: fresh }
          } catch (error) {
            return { result: [`Not started: ${error instanceof Error ? error.message : String(error)}`] }
          }
        },
        release: async () => {
          const { versions } = this.options
          const known = offline ? { ...local, latest: "offline" } : await versions.withLatest(local)
          return { versions: known, newer: versions.newer(known) }
        },
        apply: (queue, dryRun, scope) => {
          const result = this.options.apply.apply({ queue, left: shown.left!, right: shown.right!, dryRun, maps, scope })
          const outcome = {
            ...result,
            ...(result.left === undefined ? {} : { left: checked(result.left) }),
            ...(result.right === undefined ? {} : { right: checked(result.right) }),
          }
          // A side read again replaces the one shown; the use case closed the old one.
          Object.assign(shown, outcome.left === undefined ? {} : { left: outcome.left }, outcome.right === undefined ? {} : { right: outcome.right })
          if (outcome.changed) applied.push(...outcome.result)
          return outcome
        },
      }
      await this.options.show(createBrowser(shown.left, shown.right ?? null, 1, { versions: local, newer: false }), controls)
      // What changed a store is printed whole once the screen is back: the undo command does not fit the panel.
      for (const line of applied) output.line(line)
      return 0
    } finally {
      for (const profile of [shown.left, shown.right]) if (profile !== undefined) profiles.close(profile)
    }
  }

  private usage(): number {
    this.options.output.line(TUI_USAGE)
    return 2
  }
}
