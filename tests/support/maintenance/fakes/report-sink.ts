import type { ReportSinkPort } from "@session-manager/domain/ports/outbound/ReportSinkPort"

export interface WrittenReport {
  readonly path: string
  readonly report: unknown
}

/** Keeps every report in memory instead of writing a file. */
export class FakeReportSink implements ReportSinkPort {
  public readonly written: WrittenReport[] = []

  write(path: string, report: unknown): void {
    this.written.push({ path, report })
  }
}
