export interface ParsedOptions {
  /** The last value of each option. */
  readonly single: Map<string, string>
  /** Every value of each option, in order. */
  readonly many: Map<string, string[]>
  readonly flags: Set<string>
}

/** `--name value` options and bare `--flag`s; null on an unknown name or a missing value. */
export function parseOptions(argv: readonly string[], withValue: readonly string[], bare: readonly string[]): ParsedOptions | null {
  const parsed: ParsedOptions = { single: new Map(), many: new Map(), flags: new Set() }
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
