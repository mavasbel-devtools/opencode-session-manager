import type { OutputPort } from "@session-manager/domain/ports/outbound/OutputPort"

/**
 * The only place the tool writes to stdout. It writes to the stream, not through `console.log`:
 * under Bun, once `solid-js` is loaded from a preload (as `bunfig.toml` does for the session
 * browser), `console.log` output to a pipe is cut at 64 KiB, which truncated `sessions --json`.
 */
export class ConsoleOutputAdapter implements OutputPort {
  constructor() {}

  line(text: string): void {
    process.stdout.write(`${text}\n`)
  }
}
