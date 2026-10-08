/** One command family behind the router. */
export interface CommandAdapter {
  run(argv: readonly string[]): number
}

/** Sends `<family> …` to that family's adapter (without the family word), and every other mode to the compact adapter. */
export class CliRouter {
  private readonly compact: CommandAdapter
  private readonly families: Readonly<Record<string, CommandAdapter>>

  constructor(compact: CommandAdapter, families: Readonly<Record<string, CommandAdapter>>) {
    this.compact = compact
    this.families = families
  }

  run(argv: readonly string[]): number {
    const family = argv[0] !== undefined && Object.hasOwn(this.families, argv[0]) ? this.families[argv[0]] : undefined
    return family === undefined ? this.compact.run(argv) : family.run(argv.slice(1))
  }
}
