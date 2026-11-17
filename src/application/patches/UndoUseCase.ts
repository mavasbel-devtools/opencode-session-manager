import type { ChangeWriter, PlannedWrite } from "@session-manager/application/patches/ChangeWriter"
import type { InstallationCatalog } from "@session-manager/application/patches/InstallationCatalog"
import type { PatchInspector } from "@session-manager/application/patches/PatchInspector"
import type { FileOnDisk, Target } from "@session-manager/domain/model/patches/PatchTargets"
import type { ActionReport, ActionResult, PatchFilter } from "@session-manager/domain/model/patches/Reports"
import type { PatchUndoPort } from "@session-manager/domain/ports/inbound/PatchUndoPort"
import type { AuditLogPort } from "@session-manager/domain/ports/outbound/AuditLogPort"
import type { BackupPort } from "@session-manager/domain/ports/outbound/BackupPort"
import type { HashPort } from "@session-manager/domain/ports/outbound/HashPort"
import { blocker } from "@session-manager/domain/services/patches/PatchRefusals"
import { revertReplacements } from "@session-manager/domain/services/patches/PatchRules"

/**
 * Puts the original files back: from the backup taken by apply when it is there and intact,
 * otherwise by reversing the replacements; either way the result must have the recorded original checksum.
 */
export class UndoUseCase implements PatchUndoPort {
  constructor(
    private readonly catalog: InstallationCatalog,
    private readonly inspector: PatchInspector,
    private readonly writer: ChangeWriter,
    private readonly backups: BackupPort,
    private readonly hash: HashPort,
    private readonly audit: AuditLogPort,
  ) {}

  async undo(filter: PatchFilter): Promise<ActionReport> {
    const results: ActionResult[] = []
    for (const target of await this.catalog.targets(filter, "undo")) results.push(await this.undoOne(target))
    return { results, auditLog: this.audit.location() }
  }

  private async original(target: Target, entry: FileOnDisk): Promise<Uint8Array | null> {
    const key = { version: target.installation.version, patch: target.patch.id, path: entry.file.path, sha: entry.file.before }
    const backup = await this.backups.find(key)
    if (backup !== null && this.hash.sha256(backup) === entry.file.before) return backup
    try {
      const bytes = new TextEncoder().encode(revertReplacements(new TextDecoder().decode(entry.bytes!), entry.file))
      return this.hash.sha256(bytes) === entry.file.before ? bytes : null
    } catch {
      return null
    }
  }

  private async undoOne(target: Target): Promise<ActionResult> {
    const onDisk = await this.inspector.readAll(target.installation, target.patch)
    const refused = blocker(target, onDisk)
    if (refused !== null) return this.writer.unchanged("undo", target, "refused", refused, onDisk ?? [])
    const pending = onDisk!.filter((entry) => entry.status.state === "patched")
    if (pending.length === 0) return this.writer.unchanged("undo", target, "already-original", null, onDisk!)
    const plans: PlannedWrite[] = []
    for (const entry of pending) {
      const bytes = await this.original(target, entry)
      if (bytes === null) {
        const reason = `${entry.file.path}: no intact backup and the replacements cannot be reversed to sha256 ${entry.file.before}`
        return this.writer.unchanged("undo", target, "refused", reason, onDisk!)
      }
      plans.push({ entry, bytes, expected: entry.file.before })
    }
    return this.writer.commit("undo", target, plans)
  }
}
