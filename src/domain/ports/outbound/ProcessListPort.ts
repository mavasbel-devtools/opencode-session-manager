import type { ProcessEntry } from "@session-manager/domain/model/Database"

/** The running processes with a given image name, used to refuse a compaction while OpenCode runs. */
export interface ProcessListPort {
  list(image: string): readonly ProcessEntry[]
}
