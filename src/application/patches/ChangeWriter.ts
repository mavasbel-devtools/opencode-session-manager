import type { FileOnDisk, Target } from "@session-manager/domain/model/patches/PatchTargets"
import type { ActionResult, Outcome } from "@session-manager/domain/model/patches/Reports"
import type { AuditLogPort } from "@session-manager/domain/ports/outbound/AuditLogPort"
import type { BackupPort } from "@session-manager/domain/ports/outbound/BackupPort"
import type { ClockPort } from "@session-manager/domain/ports/outbound/ClockPort"
import type { FilesPort } from "@session-manager/domain/ports/outbound/FilesPort"
import type { HashPort } from "@session-manager/domain/ports/outbound/HashPort"

export type Action = "apply" | "undo"

/** One file to replace: its current state on disk, the new bytes, and the checksum they must have. */
export interface PlannedWrite {
  readonly entry: FileOnDisk
  readonly bytes: Uint8Array
  readonly expected: string
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error))

/**
 * Writes the planned files of one patch on one installation as a unit: backs up each original
 * (apply only), replaces it, re-reads it and checks its checksum; on any failure every file already
 * written is put back. Every result, including refusals, goes to the audit log.
 */
export class ChangeWriter {
  constructor(
    private readonly files: FilesPort,
    private readonly hash: HashPort,
    private readonly backups: BackupPort,
    private readonly audit: AuditLogPort,
    private readonly clock: ClockPort,
  ) {}

  /** A result that changed nothing (refused, or already in the wanted state). */
  async unchanged(action: Action, target: Target, outcome: Outcome, reason: string | null, entries: readonly FileOnDisk[]) {
    const result: ActionResult = {
      patch: target.patch.id,
      installation: target.installation,
      outcome,
      reason,
      files: entries.map((entry) => ({ path: entry.file.path, from: entry.status.sha, to: entry.status.sha })),
    }
    await this.record(action, result, new Map())
    return result
  }

  async commit(action: Action, target: Target, plans: readonly PlannedWrite[]): Promise<ActionResult> {
    const { installation, patch } = target
    const backups = new Map<string, string>()
    const written: PlannedWrite[] = []
    let failure: string | null = null
    try {
      for (const plan of plans) {
        if (action === "apply") {
          const key = { version: installation.version, patch: patch.id, path: plan.entry.file.path, sha: plan.entry.status.sha! }
          backups.set(plan.entry.file.path, await this.backups.save(key, plan.entry.bytes!))
        }
        // replace() is one rename: when it throws, the file is unchanged and needs no restore.
        await this.files.replace(plan.entry.location, plan.bytes)
        written.push(plan)
        const reread = await this.files.read(plan.entry.location)
        const sha = reread === null ? null : this.hash.sha256(reread)
        if (sha !== plan.expected) throw new Error(`${plan.entry.file.path}: read back ${sha}, expected ${plan.expected}`)
      }
    } catch (error) {
      failure = message(error)
      for (const plan of written.reverse()) {
        await this.files.replace(plan.entry.location, plan.entry.bytes!).catch((restore: unknown) => {
          failure += `; restoring ${plan.entry.file.path} failed: ${message(restore)}`
        })
      }
    }
    const result: ActionResult = {
      patch: patch.id,
      installation,
      outcome: failure === null ? (action === "apply" ? "applied" : "reverted") : "failed",
      reason: failure,
      files: plans.map((plan) => ({
        path: plan.entry.file.path,
        from: plan.entry.status.sha,
        to: failure === null ? plan.expected : plan.entry.status.sha,
      })),
    }
    await this.record(action, result, backups)
    return result
  }

  private async record(action: Action, result: ActionResult, backups: ReadonlyMap<string, string>): Promise<void> {
    const time = new Date(this.clock.now()).toISOString()
    const files = result.files.length > 0 ? result.files : [{ path: "", from: null, to: null }]
    for (const file of files) {
      await this.audit.append({
        time,
        action,
        patch: result.patch,
        version: result.installation.version,
        root: result.installation.root,
        path: file.path,
        from: file.from,
        to: file.to,
        outcome: result.outcome,
        backup: backups.get(file.path) ?? null,
        reason: result.reason,
      })
    }
  }
}
