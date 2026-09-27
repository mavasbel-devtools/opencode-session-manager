import type { OutputPort } from "#domain/ports/outbound/OutputPort.ts"

/** The only place the tool writes to stdout. */
export class ConsoleOutputAdapter implements OutputPort {
  line(text: string): void {
    console.log(text)
  }
}
