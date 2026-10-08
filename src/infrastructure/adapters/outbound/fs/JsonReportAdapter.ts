import { mkdirSync, writeFileSync } from "node:fs"
import { dirName } from "#domain/model/Paths.ts"
import type { ReportSinkPort } from "#domain/ports/outbound/ReportSinkPort.ts"

/** Writes the JSON evidence file, creating its directory when it has one. */
export class JsonReportAdapter implements ReportSinkPort {
  write(path: string, report: unknown): void {
    const directory = dirName(path)
    if (directory.length > 0) mkdirSync(directory, { recursive: true })
    writeFileSync(path, JSON.stringify(report, null, 2))
  }
}
