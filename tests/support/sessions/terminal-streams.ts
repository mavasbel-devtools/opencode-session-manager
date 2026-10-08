import { Readable, Writable } from "node:stream"

/** A terminal that is not there: what OpenTUI's own test renderer uses (its stream helpers are not exported). */
class SilentTerminal extends Writable {
  readonly isTTY = true
  readonly columns: number
  readonly rows: number

  constructor(columns: number, rows: number) {
    super()
    this.columns = columns
    this.rows = rows
  }

  override _write(_chunk: unknown, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    callback()
  }

  getColorDepth(): number {
    return 24
  }
}

export function silentTerminal(columns: number, rows: number) {
  return {
    stdin: new Readable({ read() {} }) as unknown as NodeJS.ReadStream,
    stdout: new SilentTerminal(columns, rows) as unknown as NodeJS.WriteStream,
  }
}
