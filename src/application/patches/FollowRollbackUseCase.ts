import type { AdoptionRecorder } from "@session-manager/application/patches/follow/AdoptionRecorder"
import type { EntrySwitcher } from "@session-manager/application/patches/follow/EntrySwitcher"
import type { FollowReport } from "@session-manager/domain/model/patches/Reports"
import { stepLog } from "@session-manager/domain/model/patches/StepLog"
import type { PatchFollowRollbackPort } from "@session-manager/domain/ports/inbound/PatchFollowRollbackPort"
import type { AuditLogPort } from "@session-manager/domain/ports/outbound/AuditLogPort"
import type { ClockPort } from "@session-manager/domain/ports/outbound/ClockPort"
import type { FilesPort } from "@session-manager/domain/ports/outbound/FilesPort"
import type { FollowLockPort } from "@session-manager/domain/ports/outbound/FollowLockPort"
import type { KeyValuePort } from "@session-manager/domain/ports/outbound/KeyValuePort"
import { PREVIOUS_ENTRY } from "@session-manager/domain/services/patches/FollowRules"

/**
 * `follow --rollback`: puts back the Magic Context entry opencode.jsonc had before the last
 * adoption and confirms the running server reloaded it. The entry it replaces becomes the new
 * rollback target, so a second rollback undoes the first. No installed folder is removed.
 * A recorded folder entry that no longer exists is refused: rollback stops and changes nothing,
 * so a deleted store (step 11.6) can never be written back into opencode.jsonc.
 */
export class FollowRollbackUseCase implements PatchFollowRollbackPort {
  constructor(
    private readonly lock: FollowLockPort,
    private readonly switcher: EntrySwitcher,
    private readonly store: KeyValuePort,
    private readonly recorder: AdoptionRecorder,
    private readonly audit: AuditLogPort,
    private readonly clock: ClockPort,
    private readonly files: FilesPort,
  ) {}

  async rollback(): Promise<FollowReport> {
    const log = stepLog(this.clock)
    const release = await this.lock.acquire()
    if (release === null) {
      log.fail("rollback", "another follow run holds the lock")
      return { outcome: "busy", version: null, from: null, to: null, steps: log.steps(), evidence: null, auditLog: this.audit.location() }
    }
    try {
      const from = await this.switcher.current()
      const previous = await this.store.get(PREVIOUS_ENTRY)
      const report = (outcome: "rolled-back" | "stopped", to: string | null): FollowReport => ({
        outcome,
        version: null,
        from,
        to,
        steps: log.steps(),
        evidence: null,
        auditLog: this.audit.location(),
      })
      if (previous === null) log.fail("rollback", "no previous entry is recorded: follow has not adopted anything")
      else if (previous.startsWith("/") && !(await this.folderExists(previous))) log.fail("rollback", `previous entry ${previous} no longer exists`)
      else if (await this.switcher.revert(previous, log)) {
        await this.store.set(PREVIOUS_ENTRY, from)
        const reason = `${JSON.stringify(from)} → ${JSON.stringify(previous)}`
        await this.audit.append({ time: new Date(this.clock.now()).toISOString(), action: "rollback", patch: "plugin-entry", version: "", root: "", path: "opencode.jsonc", from: null, to: null, outcome: "rolled-back", backup: null, reason })
        return report("rolled-back", previous)
      }
      await this.recorder.stopped(null, log)
      return report("stopped", await this.switcher.current())
    } finally {
      await release()
    }
  }

  /** A folder entry exists when it still holds files; a removed install leaves nothing behind. */
  private async folderExists(folder: string): Promise<boolean> {
    try {
      return (await this.files.list(folder, "")).length > 0
    } catch {
      return false
    }
  }
}
