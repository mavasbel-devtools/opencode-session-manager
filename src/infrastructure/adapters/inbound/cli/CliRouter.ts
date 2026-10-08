/** One command family behind the router. */
export interface CommandAdapter {
  run(argv: readonly string[]): number
}

/** Sends `migrate …` to the migrate adapter and every other mode to the compact adapter. */
export class CliRouter {
  private readonly compact: CommandAdapter
  private readonly migrate: CommandAdapter

  constructor(compact: CommandAdapter, migrate: CommandAdapter) {
    this.compact = compact
    this.migrate = migrate
  }

  run(argv: readonly string[]): number {
    return argv[0] === "migrate" ? this.migrate.run(argv.slice(1)) : this.compact.run(argv)
  }
}
