import type { OutputPort } from "@session-manager/domain/ports/outbound/OutputPort"

/**
 * The only place the tool writes to stderr. `PatchesCliAdapter` writes usage and refusals to
 * stderr (its `CliOutput.err`); A's `OutputPort` is stdout only. This adds no method to
 * `OutputPort`, so no existing implementer changes.
 */
export class StderrOutputAdapter implements OutputPort {
  constructor() {}

  line(text: string): void {
    process.stderr.write(`${text}\n`)
  }
}
