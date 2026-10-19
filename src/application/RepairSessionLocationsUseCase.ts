import type { LocationRepair, LocationRepairReport, LocationRepairSkip } from "@session-manager/domain/model/LocationRepair"
import type { RepairSessionLocationsPort } from "@session-manager/domain/ports/inbound/RepairSessionLocationsPort"
import type { FileSystemPort } from "@session-manager/domain/ports/outbound/FileSystemPort"
import type { LocationRepairMappingsPort } from "@session-manager/domain/ports/outbound/LocationRepairMappingsPort"
import type { SessionHostPort } from "@session-manager/domain/ports/outbound/SessionHostPort"
import { relocatedFolder } from "@session-manager/domain/services/RelocateRules"

/**
 * Online repair intentionally accepts only explicit mappings. A temporary host
 * failure is never evidence that a location moved, and this code never creates
 * a destination directory.
 */
export class RepairSessionLocationsUseCase implements RepairSessionLocationsPort {
  constructor(
    private readonly host: SessionHostPort,
    private readonly files: FileSystemPort,
    private readonly mappings: LocationRepairMappingsPort,
  ) {}

  async execute(sessionIds?: readonly string[]): Promise<LocationRepairReport> {
    const rules = this.mappings.mappings()
    const repaired: LocationRepair[] = []
    const skipped: LocationRepairSkip[] = []
    if (rules.length === 0) return { rules, repaired, skipped }
    const selected = sessionIds === undefined ? undefined : new Set(sessionIds)
    for (const session of await this.host.listSessions()) {
      if (selected !== undefined && !selected.has(session.id)) continue
      if (this.files.isDirectory(session.directory)) {
        skipped.push({ session_id: session.id, directory: session.directory, reason: "directory-present", to_directory: null })
        continue
      }
      const target = relocatedFolder(rules, session.directory)
      if (target === null) {
        skipped.push({ session_id: session.id, directory: session.directory, reason: "not-mapped", to_directory: null })
        continue
      }
      if (!this.files.isDirectory(target)) {
        skipped.push({ session_id: session.id, directory: session.directory, reason: "target-missing", to_directory: target })
        continue
      }
      await this.host.moveSession(session.id, target)
      repaired.push({ session_id: session.id, from_directory: session.directory, to_directory: target })
    }
    return { rules, repaired, skipped }
  }
}
