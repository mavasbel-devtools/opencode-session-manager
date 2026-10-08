/** Writes the JSON evidence file for a run. */
export interface ReportSinkPort {
  write(path: string, report: unknown): void
}
