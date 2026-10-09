import type { PageStats } from "@session-manager/domain/model/Database"

/**
 * How much free space a compaction needs: the compacted size twice (the copy plus the room the
 * VACUUM INTO needs while writing) plus whatever the WAL currently holds.
 */
export class RequiredSpacePolicy {
  constructor() {}

  requiredBytes(pages: PageStats, walBytes: number): number {
    return 2 * (pages.logical_bytes - pages.free_bytes) + walBytes
  }
}
