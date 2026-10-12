import path from "node:path"
import type { BuildAndVerifyResult } from "@session-manager/domain/model/Build"
import { defaultDatabasePath } from "@session-manager/domain/model/Database"
import { defaultDataHome, profileAt } from "@session-manager/domain/model/Profile"
import type { StaleLock } from "@session-manager/domain/model/StoreLock"
import type { CompactPort } from "@session-manager/domain/ports/inbound/CompactPort"
import type { PreflightPort } from "@session-manager/domain/ports/inbound/PreflightPort"
import type { RehearsePort } from "@session-manager/domain/ports/inbound/RehearsePort"
import type { RollbackPort } from "@session-manager/domain/ports/inbound/RollbackPort"
import type { OutputPort } from "@session-manager/domain/ports/outbound/OutputPort"
import type { RuntimePort } from "@session-manager/domain/ports/outbound/RuntimePort"

export interface CliEnvironment {
  readonly XDG_DATA_HOME?: string | undefined
  readonly OPENCODE_DB_COMPACT_IMAGE?: string | undefined
  readonly OPENCODE_DB_COMPACT_REHEARSAL_DIR?: string | undefined
  readonly XDG_CACHE_HOME?: string | undefined
  /** An explicit Magic Context package folder, instead of the one in OpenCode's package cache. */
  readonly OPENCODE_SESSION_MANAGER_MAGIC_CONTEXT?: string | undefined
}

export const USAGE =
  "usage: opencode-session-manager <preflight|rehearse|run|rollback <backupDir>|sync …|sessions …|context …|tui …> [--db <path>]... [--keep]"

export interface CliArguments {
  readonly mode: string | undefined
  readonly positional: readonly string[]
  /** The last `--db`. */
  readonly db: string | undefined
  /** Every `--db`, in order (`rollback` restores each). */
  readonly dbs: readonly string[]
  readonly keep: boolean
}

export function parseArguments(argv: readonly string[]): CliArguments {
  const positional: string[] = []
  let db: string | undefined
  const dbs: string[] = []
  let keep = false
  for (let index = 1; index < argv.length; index++) {
    const token = argv[index]
    if (token === "--db") {
      index++
      db = argv[index]
      if (db !== undefined) dbs.push(db)
    } else if (token === "--keep") {
      keep = true
    } else if (token !== undefined) {
      positional.push(token)
    }
  }
  return { mode: argv[0], positional, db, dbs, keep }
}

export interface CliAdapterOptions {
  readonly preflight: PreflightPort
  readonly rehearse: RehearsePort
  readonly compact: CompactPort
  readonly rollback: RollbackPort
  readonly output: OutputPort
  readonly runtime: RuntimePort
  readonly environment: CliEnvironment
  readonly image: string
  readonly rehearsalDirectory: string
}

/** The only place argv is read and exit codes are produced. It formats; the use cases decide. */
export class CompactCliAdapter {
  private readonly options: CliAdapterOptions

  constructor(options: CliAdapterOptions) {
    this.options = options
  }

  run(argv: readonly string[]): number {
    const args = parseArguments(argv)
    const dbPath = args.db ?? defaultDatabasePath(this.options.environment, this.options.runtime.homeDirectory())
    this.options.output.line(`database: ${dbPath}`)

    if (args.mode === "preflight") {
      const report = this.options.preflight.execute({ dbPath, image: this.options.image })
      this.options.output.line(JSON.stringify(report, null, 2))
      return 0
    }

    if (args.mode === "rehearse") {
      const outcome = this.options.rehearse.execute({
        dbPath,
        directory: this.options.rehearsalDirectory,
        keep: args.keep,
      })
      this.printChecks(outcome.build)
      const verdict = outcome.build.ok ? "REHEARSAL OK" : "REHEARSAL FAILED"
      this.options.output.line(
        `${verdict} vacuum_ms=${outcome.build.vacuum_ms} total_ms=${outcome.build.total_ms} target_bytes=${outcome.build.target_bytes}`,
      )
      this.options.output.line(`report: ${outcome.reportPath}`)
      return outcome.build.ok ? 0 : 1
    }

    if (args.mode === "run") {
      const outcome = this.options.compact.execute({ dbPath, image: this.options.image })
      this.printStaleLocks(outcome.staleLocksCleared)
      this.printChecks(outcome.build)
      if (!outcome.swapped) {
        this.options.output.line(`ABORTED: originals untouched; failed copy kept at ${outcome.failedTarget}`)
        return 1
      }
      this.options.output.line(
        `SWAPPED backup=${outcome.backupDir} before_bytes=${outcome.beforeBytes} after_bytes=${outcome.afterBytes} post_integrity_ok=${outcome.postIntegrityOk}`,
      )
      return outcome.postIntegrityOk ? 0 : 1
    }

    const backupDirectory = args.positional[0]
    if (args.mode === "rollback" && backupDirectory !== undefined) {
      const liveStores = this.liveStoresAmong(args.dbs.length > 1 ? args.dbs : [dbPath])
      const outcomes =
        args.dbs.length > 1
          ? this.options.rollback.executeAll({ dbPaths: args.dbs, backupDir: backupDirectory, image: this.options.image, liveStores })
          : [this.options.rollback.execute({ dbPath, backupDir: backupDirectory, image: this.options.image, liveStores })]
      for (const outcome of outcomes) {
        this.printStaleLocks(outcome.staleLocksCleared)
        this.options.output.line(`ROLLED BACK restored=${outcome.restored.join(",")} parked=${outcome.parked}`)
      }
      return 0
    }

    this.options.output.line(USAGE)
    return 2
  }

  /** Which of the given stores are this user's OpenCode's own (its data home's), compared as absolute paths. */
  private liveStoresAmong(stores: readonly string[]): readonly string[] {
    const home = this.options.runtime.homeDirectory()
    const live = profileAt("live", defaultDataHome(this.options.environment, home))
    const own = new Set([defaultDatabasePath(this.options.environment, home), live.contextDb].map((store) => path.resolve(store)))
    return stores.filter((store) => own.has(path.resolve(store)))
  }

  private printStaleLocks(locks: readonly StaleLock[]): void {
    for (const lock of locks) this.options.output.line(`CLEARED stale lock ${lock.file} (pid ${lock.pid}, ${lock.command}, since ${lock.since}: no such process)`)
  }

  private printChecks(result: BuildAndVerifyResult): void {
    for (const [name, passed] of Object.entries(result.checks)) {
      this.options.output.line(`${passed ? "PASS" : "FAIL"} ${name}`)
    }
    for (const table of result.comparison.tables.filter((entry) => !entry.match)) {
      this.options.output.line(`  differs: ${table.name} source_rows=${table.source_rows} target_rows=${table.target_rows}`)
    }
  }
}
