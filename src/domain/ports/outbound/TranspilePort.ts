/** Parses JavaScript without running it. */
export interface TranspilePort {
  /** The parse error, or null when the code parses. */
  error(code: string): string | null
}
