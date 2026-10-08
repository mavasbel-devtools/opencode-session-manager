import type { OutputPort } from "#domain/ports/outbound/OutputPort.ts"

/** Collects the lines the CLI would print. */
export class FakeOutput implements OutputPort {
  public readonly lines: string[] = []

  line(text: string): void {
    this.lines.push(text)
  }

  text(): string {
    return this.lines.join("\n")
  }
}
