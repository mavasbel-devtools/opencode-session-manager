import type { PageStats } from "#domain/model/Database.ts"

/**
 * How much free space a compaction needs: the compacted size twice (the copy plus the room the
 * VACUUM INTO needs while writing) plus whatever the WAL currently holds.
 */
export class RequiredSpacePolicy {
  requiredBytes(pages: PageStats, walBytes: number): number {
    return 2 * (pages.logical_bytes - pages.free_bytes) + walBytes
  }

  /**
   * A migration copies every input, grows the base copy by the merged rows, then compacts it into
   * the final copy: three times the used pages of all inputs, plus their WALs.
   */
  migrationBytes(inputs: readonly { readonly pages: PageStats; readonly walBytes: number }[]): number {
    return inputs.reduce((total, input) => total + 3 * (input.pages.logical_bytes - input.pages.free_bytes) + input.walBytes, 0)
  }
}
