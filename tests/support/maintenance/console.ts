/**
 * Redirects the tool's stdout (`process.stdout.write`, which `ConsoleOutputAdapter` uses) and
 * `console.log` into an array of lines, so an end-to-end run can be asserted without noise.
 */
export function captureConsole(): { lines: string[]; restore: () => void } {
  const lines: string[] = []
  const originalLog = console.log
  const originalWrite = process.stdout.write
  console.log = (value?: unknown) => {
    lines.push(String(value))
  }
  process.stdout.write = ((chunk: string | Uint8Array) => {
    const text = typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk)
    // One `OutputPort.line` is one write: keep it one entry, as `console.log` capture did.
    lines.push(text.replace(/\n$/, ""))
    return true
  }) as typeof process.stdout.write
  return {
    lines,
    restore: () => {
      console.log = originalLog
      process.stdout.write = originalWrite
    },
  }
}

/** Redirects console.error into an array. */
export function captureConsoleError(): { lines: string[]; restore: () => void } {
  const lines: string[] = []
  const original = console.error
  console.error = (value?: unknown) => {
    lines.push(String(value))
  }
  return {
    lines,
    restore: () => {
      console.error = original
    },
  }
}
