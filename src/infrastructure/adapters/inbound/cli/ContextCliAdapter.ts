import type { CopyMagicContextPort } from "@session-manager/domain/ports/inbound/CopyMagicContextPort"
import type { OutputPort } from "@session-manager/domain/ports/outbound/OutputPort"

export const CONTEXT_USAGE = "usage: opencode-session-manager context copy --from <context.db> --to <file>"

export interface ContextCliOptions {
  readonly copy: CopyMagicContextPort
  readonly output: OutputPort
}

/**
 * `context copy`: a copy of a Magic Context store, upgraded to the format the installed Magic
 * Context writes. The source is only read, so this is safe while OpenCode runs.
 */
export class ContextCliAdapter {
  private readonly options: ContextCliOptions

  constructor(options: ContextCliOptions) {
    this.options = options
  }

  run(argv: readonly string[]): number {
    const values = new Map<string, string>()
    let valid = argv[0] === "copy"
    for (let index = 1; valid && index < argv.length; index += 2) {
      const value = argv[index + 1]
      if (!["--from", "--to"].includes(argv[index]!) || value === undefined || value.startsWith("--")) valid = false
      else values.set(argv[index]!, value)
    }
    const source = values.get("--from")
    const target = values.get("--to")
    if (!valid || source === undefined || target === undefined) {
      this.options.output.line(CONTEXT_USAGE)
      return 2
    }
    this.options.output.line(JSON.stringify(this.options.copy.copy({ source, target }), null, 2))
    return 0
  }
}
