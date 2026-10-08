import type { PageStats, ProcessEntry, SidecarSizes } from "#domain/model/Database.ts"

export interface PreflightInput {
  readonly dbPath: string
  readonly image: string
}

/** What `preflight` prints as JSON: sizes, page statistics, free disk and any running OpenCode process. */
export interface PreflightReport {
  readonly files: SidecarSizes
  readonly pages: PageStats
  readonly free_disk_bytes: number
  readonly running: readonly ProcessEntry[]
}

export interface PreflightPort {
  execute(input: PreflightInput): PreflightReport
}
