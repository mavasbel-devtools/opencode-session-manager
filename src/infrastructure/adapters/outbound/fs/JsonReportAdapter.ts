import { mkdirSync, writeFileSync } from "node:fs"
import { dirName } from "@session-manager/domain/model/DatabasePaths"
import type { ReportSinkPort } from "@session-manager/domain/ports/outbound/ReportSinkPort"

/** Writes the JSON evidence file, creating its directory when it has one. */
export class JsonReportAdapter implements ReportSinkPort {
  constructor() {}

  write(path: string, report: unknown): void {
    const directory = dirName(path)
    if (directory.length > 0) mkdirSync(directory, { recursive: true })
    writeFileSync(path, JSON.stringify(report, null, 2))
  }
}
