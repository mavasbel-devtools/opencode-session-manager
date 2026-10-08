import type { OutputPort } from "@session-manager/domain/ports/outbound/OutputPort"

/** The only place the tool writes to stdout. */
export class ConsoleOutputAdapter implements OutputPort {
  constructor() {}

  line(text: string): void {
    console.log(text)
  }
}
