import type { ChangeWriter, PlannedWrite } from "@session-manager/application/patches/ChangeWriter"
import type { InstallationCatalog } from "@session-manager/application/patches/InstallationCatalog"
import type { PatchInspector } from "@session-manager/application/patches/PatchInspector"
import type { FileOnDisk, Target } from "@session-manager/domain/model/patches/PatchTargets"
import type { ActionReport, ActionResult, PatchFilter } from "@session-manager/domain/model/patches/Reports"
import type { PatchApplyPort } from "@session-manager/domain/ports/inbound/PatchApplyPort"
import type { AuditLogPort } from "@session-manager/domain/ports/outbound/AuditLogPort"
import type { HashPort } from "@session-manager/domain/ports/outbound/HashPort"
import { blocker } from "@session-manager/domain/services/patches/PatchRefusals"
import { applyReplacements } from "@session-manager/domain/services/patches/PatchRules"

/** Applies patches: every file must be the recorded original, and the result must have the recorded checksum. */
export class ApplyUseCase implements PatchApplyPort {
  constructor(
    private readonly catalog: InstallationCatalog,
    private readonly inspector: PatchInspector,
    private readonly writer: ChangeWriter,
    private readonly hash: HashPort,
    private readonly audit: AuditLogPort,
  ) {}

  async apply(filter: PatchFilter): Promise<ActionReport> {
    const results: ActionResult[] = []
    for (const target of await this.catalog.targets(filter)) results.push(await this.applyOne(target))
    return { results, auditLog: this.audit.location() }
  }

  private async applyOne(target: Target): Promise<ActionResult> {
    const onDisk = await this.inspector.readAll(target.installation, target.patch)
    const refused = blocker(target, onDisk)
    if (refused !== null) return this.writer.unchanged("apply", target, "refused", refused, onDisk ?? [])
    const pending = onDisk!.filter((entry) => entry.status.state === "original")
    if (pending.length === 0) return this.writer.unchanged("apply", target, "already-applied", null, onDisk!)
    const plans: PlannedWrite[] = []
    for (const entry of pending) {
      let bytes: Uint8Array
      try {
        bytes = new TextEncoder().encode(applyReplacements(new TextDecoder().decode(entry.bytes!), entry.file))
      } catch (error) {
        return this.writer.unchanged("apply", target, "refused", (error as Error).message, onDisk!)
      }
      const sha = this.hash.sha256(bytes)
      if (sha !== entry.file.after) {
        const reason = `${entry.file.path}: the patched result has sha256 ${sha}, not the recorded ${entry.file.after}`
        return this.writer.unchanged("apply", target, "refused", reason, onDisk!)
      }
      plans.push({ entry, bytes, expected: entry.file.after })
    }
    return this.writer.commit("apply", target, plans)
  }
}
