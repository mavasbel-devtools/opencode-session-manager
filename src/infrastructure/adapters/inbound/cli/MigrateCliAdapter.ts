import { defaultDatabasePath } from "@session-manager/domain/model/Database"
import type { Relocation } from "@session-manager/domain/model/Migration"
import { dirName } from "@session-manager/domain/model/DatabasePaths"
import type { MigrateOutcome, MigratePort } from "@session-manager/domain/ports/inbound/MigratePort"
import type { OutputPort } from "@session-manager/domain/ports/outbound/OutputPort"
import type { RuntimePort } from "@session-manager/domain/ports/outbound/RuntimePort"
import type { CliEnvironment } from "@session-manager/infrastructure/adapters/inbound/cli/CompactCliAdapter"

export const MIGRATE_USAGE =
  "usage: opencode-session-manager migrate <rehearse|run> --from <db> [--from <db>]... --windows-user <name> " +
  "[--drive <letter>] [--mount <dir>]... [--relocate <from>=<to>]... [--home <dir>] [--db <path>] [--keep]"

export interface MigrateArguments {
  readonly mode: string | undefined
  readonly from: readonly string[]
  readonly windowsUser: string | undefined
  readonly drive: string
  readonly mounts: readonly string[]
  readonly relocations: readonly Relocation[]
  readonly home: string | undefined
  readonly db: string | undefined
  readonly keep: boolean
  /** Unknown flags, flags without a value, and malformed relocations. */
  readonly errors: readonly string[]
}

const VALUE_FLAGS = ["--from", "--windows-user", "--drive", "--mount", "--relocate", "--home", "--db"]

/** Reads `migrate`'s arguments, `argv` starting after the word `migrate`. */
export function parseMigrateArguments(argv: readonly string[]): MigrateArguments {
  const values = new Map<string, string[]>(VALUE_FLAGS.map((flag) => [flag, []]))
  const errors: string[] = []
  const positional: string[] = []
  let keep = false
  for (let index = 0; index < argv.length; index++) {
    const token = argv[index] as string
    const bucket = values.get(token)
    if (bucket !== undefined) {
      const value = argv[index + 1]
      if (value === undefined || value.startsWith("--")) errors.push(`${token} needs a value`)
      else bucket.push(value)
      index++
    } else if (token === "--keep") keep = true
    else if (token.startsWith("--")) errors.push(`unknown option ${token}`)
    else positional.push(token)
  }
  const relocations: Relocation[] = []
  for (const spec of values.get("--relocate") as string[]) {
    const split = spec.indexOf("=")
    if (split <= 0 || split === spec.length - 1) errors.push(`--relocate expects <from>=<to>, got ${spec}`)
    else relocations.push({ from: spec.slice(0, split).replace(/\/+$/, ""), to: spec.slice(split + 1).replace(/\/+$/, "") })
  }
  const last = (flag: string): string | undefined => (values.get(flag) as string[]).at(-1)
  return {
    mode: positional[0],
    from: values.get("--from") as string[],
    windowsUser: last("--windows-user"),
    drive: last("--drive") ?? "C",
    mounts: values.get("--mount") as string[],
    relocations,
    home: last("--home"),
    db: last("--db"),
    keep,
    errors,
  }
}

export interface MigrateCliOptions {
  readonly migrate: MigratePort
  readonly output: OutputPort
  readonly runtime: RuntimePort
  readonly environment: CliEnvironment
  readonly image: string
  readonly rehearsalDirectory: string
}

/** `migrate rehearse|run`: formats the outcome; the use case decides. */
export class MigrateCliAdapter {
  private readonly options: MigrateCliOptions

  constructor(options: MigrateCliOptions) {
    this.options = options
  }

  run(argv: readonly string[]): number {
    const { output, runtime } = this.options
    const args = parseMigrateArguments(argv)
    const dbPath = args.db ?? defaultDatabasePath(this.options.environment, runtime.homeDirectory())
    output.line(`database: ${dbPath}`)
    const mode = args.mode
    if (
      (mode !== "rehearse" && mode !== "run") ||
      args.from.length === 0 ||
      args.windowsUser === undefined ||
      args.errors.length > 0
    ) {
      for (const error of args.errors) output.line(error)
      output.line(MIGRATE_USAGE)
      return 2
    }
    for (const source of args.from) output.line(`source: ${source}`)

    const outcome = this.options.migrate.execute({
      dbPath,
      sources: args.from,
      mapping: {
        home: (args.home ?? runtime.homeDirectory()).replace(/\/+$/, ""),
        windowsUser: args.windowsUser,
        drive: args.drive,
        mounts: args.mounts,
        relocations: args.relocations,
      },
      mode,
      directory: mode === "run" ? dirName(dbPath) : this.options.rehearsalDirectory,
      keep: args.keep,
      image: this.options.image,
    })
    this.print(outcome)

    if (mode === "rehearse") {
      const kept = outcome.migrated === null ? "" : ` migrated=${outcome.migrated}`
      output.line(`${outcome.ok ? "REHEARSAL OK" : "REHEARSAL FAILED"}${kept}`)
      output.line(`report: ${outcome.reportPath}`)
      return outcome.ok ? 0 : 1
    }
    if (!outcome.swapped) {
      output.line(`ABORTED: originals untouched; migrated copy kept at ${outcome.migrated}`)
      output.line(`report: ${outcome.reportPath}`)
      return 1
    }
    output.line(`SWAPPED backup=${outcome.backupDir} post_integrity_ok=${outcome.postIntegrityOk}`)
    output.line(`report: ${outcome.reportPath}`)
    output.line(`undo: opencode-session-manager rollback ${outcome.backupDir} --db ${dbPath}`)
    return outcome.postIntegrityOk ? 0 : 1
  }

  private print(outcome: MigrateOutcome): void {
    const { output } = this.options
    for (const rewrite of outcome.rewrites) {
      output.line(`rewrote ${rewrite.cells_rewritten} cells in ${rewrite.source}`)
    }
    for (const merge of outcome.merges) {
      const inserted = merge.tables.reduce((total, table) => total + table.inserted, 0)
      output.line(`merged ${inserted} rows from ${merge.source}`)
    }
    const rekey = outcome.rekey
    output.line(
      `rekeyed sessions=${rekey.sessions_rekeyed} projects_remapped=${rekey.projects_remapped} ` +
        `created=${rekey.projects_created} dropped=${rekey.projects_dropped} subpaths_fixed=${rekey.subpaths_fixed}`,
    )
    if (rekey.missing_directories.length > 0) {
      output.line(`session folders missing on this machine: ${rekey.missing_directories.length} (see report; add --relocate)`)
    }
    const verification = outcome.verification
    const details = [
      ...Object.entries(verification.checks).map(([name, passed]) => `${passed ? "PASS" : "FAIL"} ${name}`),
      ...Object.entries(verification.missing_rows).flatMap(([input, tables]) =>
        Object.entries(tables).map(([table, count]) => `  missing: ${table} ${count} rows from ${input}`),
      ),
      ...verification.windows_sessions.map((directory) => `  windows session folder: ${directory}`),
      ...Object.entries(verification.residual).map(([column, count]) => `  residual: ${column} ${count}`),
      ...(verification.subpath_mismatches > 0 ? [`  subpath mismatches: ${verification.subpath_mismatches}`] : []),
    ]
    for (const line of details) output.line(line)
  }
}
