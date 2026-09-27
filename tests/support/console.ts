/** Redirects console.log into an array, so an end-to-end run can be asserted without noise. */
export function captureConsole(): { lines: string[]; restore: () => void } {
  const lines: string[] = []
  const original = console.log
  console.log = (value?: unknown) => {
    lines.push(String(value))
  }
  return {
    lines,
    restore: () => {
      console.log = original
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
