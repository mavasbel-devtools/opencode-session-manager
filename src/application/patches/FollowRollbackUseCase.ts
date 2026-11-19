import type { AdoptionRecorder } from "@session-manager/application/patches/follow/AdoptionRecorder"
import type { ConfigEntries } from "@session-manager/application/patches/follow/ConfigEntrySet"
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
      const fromEntries = await this.switcher.current()
      const from = fromEntries.opencode
      const previous = this.previous(await this.store.get(PREVIOUS_ENTRY))
      const report = (outcome: "rolled-back" | "stopped", to: string | null): FollowReport => ({
        outcome,
        version: null,
        from,
        to,
        steps: log.steps(),
        evidence: null,
        auditLog: this.audit.location(),
      })
      const missing = previous === null ? null : await this.missing(previous)
      if (previous === null) log.fail("rollback", "no previous entry is recorded: follow has not adopted anything")
      else if (missing !== null) log.fail("rollback", `previous entry ${missing} no longer exists`)
      else if (await this.switcher.revert(previous, log)) {
        await this.store.set(PREVIOUS_ENTRY, JSON.stringify(fromEntries))
        const reason = `${JSON.stringify(fromEntries)} → ${JSON.stringify(previous)}`
        await this.audit.append({ time: new Date(this.clock.now()).toISOString(), action: "rollback", patch: "plugin-entry", version: "", root: "", path: "opencode.jsonc", from: null, to: null, outcome: "rolled-back", backup: null, reason })
        return report("rolled-back", previous.opencode)
      }
      await this.recorder.stopped(null, log)
      return report("stopped", (await this.switcher.current()).opencode)
    } finally {
      await release()
    }
  }

  /** A JSON pair written by `follow`, or a plain string written before tui.jsonc was published to. */
  private previous(raw: string | null): ConfigEntries | null {
    if (raw === null) return null
    if (raw.trimStart().startsWith("{")) {
      try {
        const value = JSON.parse(raw) as { opencode?: unknown; tui?: unknown }
        return { opencode: typeof value.opencode === "string" ? value.opencode : null, tui: typeof value.tui === "string" ? value.tui : null }
      } catch {
        return { opencode: raw, tui: null }
      }
    }
    return { opencode: raw, tui: null }
  }

  /** The first recorded folder entry that no longer holds files, if any. */
  private async missing(entries: ConfigEntries): Promise<string | null> {
    for (const entry of [entries.opencode, entries.tui]) {
      if (entry !== null && entry.startsWith("/") && !(await this.folderExists(entry))) return entry
    }
    return null
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
