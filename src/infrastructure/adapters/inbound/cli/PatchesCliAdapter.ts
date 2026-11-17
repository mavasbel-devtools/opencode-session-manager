import { PatchError } from "@session-manager/domain/errors/PatchError"
import type { PatchFilter } from "@session-manager/domain/model/patches/Reports"
import type { PatchCommands } from "@session-manager/domain/model/patches/PatchCommands"
import { PatchesTextFormatter } from "@session-manager/infrastructure/adapters/inbound/cli/PatchesTextFormatter"

export interface CliOutput {
  out(text: string): void
  err(text: string): void
}

export const PATCHES_HELP = `opencode-session-manager patches — auditable local patches for the installed Magic Context plugin

usage:
  opencode-session-manager patches status  [--json]                          every patch on every installed copy
  opencode-session-manager patches apply   [--patch <id>] [--version <v>] [--json]
  opencode-session-manager patches undo    [--patch <id>] [--version <v>] [--json]
  opencode-session-manager patches check   [--json]                          exit 0 only if all patches are applied on the loaded copy
  opencode-session-manager patches inspect --version <v> [--json]            review a version a patch was not checked against
  opencode-session-manager patches effect  [--since <ISO time>] [--json]     is the configured threshold in use? (Magic Context's log)
  opencode-session-manager patches notify  [--json]                          desktop notification when check fails (used by systemd)
  opencode-session-manager patches follow  [--version <v>] [--json]          adopt the newest release (or <v>) already patched
  opencode-session-manager patches follow  --rollback [--json]               put back the entry opencode.jsonc had before
  opencode-session-manager patches --help | --version

apply and undo work on the copy opencode.jsonc pins unless --version names another installed version.
follow stages, patches and proves a new release in an isolated OpenCode server before it changes the
one Magic Context entry of opencode.jsonc; it stops, and changes nothing OpenCode loads, on any doubt.
exit codes: 0 ok, 1 not ok / refused / failed / stopped, 2 usage error.`

const COMMANDS = ["status", "apply", "undo", "check", "inspect", "effect", "notify", "follow"] as const
type Command = (typeof COMMANDS)[number]
const VALUE_FLAGS = new Set(["--patch", "--version", "--since"])

interface Parsed {
  readonly command: Command
  readonly json: boolean
  readonly rollback: boolean
  readonly values: ReadonlyMap<string, string>
}

function parse(argv: readonly string[]): Parsed {
  const [command, ...rest] = argv
  if (!COMMANDS.includes(command as Command)) throw new PatchError("usage", `unknown command ${command ?? "(none)"}`)
  let json = false
  let rollback = false
  const values = new Map<string, string>()
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i]!
    if (arg === "--json") json = true
    else if (arg === "--rollback" && command === "follow") rollback = true
    else if (VALUE_FLAGS.has(arg) && rest[i + 1] !== undefined) values.set(arg, rest[(i += 1)]!)
    else throw new PatchError("usage", `unexpected argument ${arg}`)
  }
  if (rollback && values.has("--version")) throw new PatchError("usage", "follow takes --rollback or --version, not both")
  return { command: command as Command, json, rollback, values }
}

/** The command line: parses, runs one command, prints text or JSON, and returns the exit code. */
export class PatchesCliAdapter {
  constructor(
    private readonly commands: PatchCommands,
    private readonly output: CliOutput,
    private readonly version: string,
  ) {}

  async run(argv: readonly string[]): Promise<number> {
    if (argv.length === 0 || argv[0] === "--help" || argv[0] === "-h") {
      this.output.out(PATCHES_HELP)
      return argv.length === 0 ? 2 : 0
    }
    if (argv[0] === "--version") {
      this.output.out(`opencode-session-manager ${this.version}`)
      return 0
    }
    try {
      return await this.dispatch(parse(argv))
    } catch (error) {
      if (!(error instanceof PatchError)) throw error
      this.output.err(`${error.code === "usage" ? "usage error" : "error"}: ${error.message}`)
      if (error.code === "usage") this.output.err("run with --help for usage")
      return error.code === "usage" ? 2 : 1
    }
  }

  private print<T>(json: boolean, report: T, text: (report: T) => string): void {
    this.output.out(json ? JSON.stringify(report, null, 2) : text(report))
  }

  private filter(values: ReadonlyMap<string, string>): PatchFilter {
    return {
      ...(values.has("--patch") ? { patch: values.get("--patch")! } : {}),
      ...(values.has("--version") ? { version: values.get("--version")! } : {}),
    }
  }

  private async dispatch({ command, json, rollback, values }: Parsed): Promise<number> {
    switch (command) {
      case "status": {
        this.print(json, await this.commands.status.status(), PatchesTextFormatter.status)
        return 0
      }
      case "apply":
      case "undo": {
        const filter = this.filter(values)
        const report = command === "apply" ? await this.commands.apply.apply(filter) : await this.commands.undo.undo(filter)
        this.print(json, report, PatchesTextFormatter.action)
        return report.results.some((r) => r.outcome === "refused" || r.outcome === "failed") ? 1 : 0
      }
      case "check": {
        const report = await this.commands.check.check()
        this.print(json, report, PatchesTextFormatter.check)
        return report.ok ? 0 : 1
      }
      case "inspect": {
        const version = values.get("--version")
        if (version === undefined) throw new PatchError("usage", "inspect needs --version <v>")
        this.print(json, await this.commands.inspect.inspect(version), PatchesTextFormatter.inspect)
        return 0
      }
      case "effect": {
        const since = values.get("--since")
        const sinceMs = since === undefined ? null : Date.parse(since)
        if (Number.isNaN(sinceMs)) throw new PatchError("usage", `--since ${since} is not a date and time`)
        const report = await this.commands.effect.effect(sinceMs)
        this.print(json, report, PatchesTextFormatter.effect)
        return report.verdict === "respected" ? 0 : 1
      }
      case "notify": {
        const report = await this.commands.notify.notify()
        this.print(json, report, PatchesTextFormatter.notify)
        return report.ok ? 0 : 1
      }
      case "follow": {
        const report = rollback ? await this.commands.rollback.rollback() : await this.commands.follow.follow(values.get("--version") ?? null)
        this.print(json, report, PatchesTextFormatter.follow)
        return ["adopted", "up-to-date", "rolled-back"].includes(report.outcome) ? 0 : 1
      }
    }
  }
}
