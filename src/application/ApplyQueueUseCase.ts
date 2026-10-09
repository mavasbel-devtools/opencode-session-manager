import { requestsFor } from "@session-manager/domain/model/BrowserQueue"
import type { Direction, OpenedProfile } from "@session-manager/domain/model/BrowserState"
import { syncSideOf, syncSummary } from "@session-manager/domain/model/MagicContextSync"
import type { ApplyQueueInput, ApplyQueueOutcome, ApplyQueuePort } from "@session-manager/domain/ports/inbound/ApplyQueuePort"
import type { OpenProfilePort } from "@session-manager/domain/ports/inbound/OpenProfilePort"
import type { SyncMagicContextPort } from "@session-manager/domain/ports/inbound/SyncMagicContextPort"

const DIRECTIONS: readonly Direction[] = ["to-right", "to-left"]

/**
 * Carries out the queue: one sync per direction that has entries, left to right first. After a
 * store changed, its side is read again so the browser shows the new state. An error stops the
 * queue and is reported; a direction already applied stays applied (it has its own backup).
 */
export class ApplyQueueUseCase implements ApplyQueuePort {
  private readonly sync: SyncMagicContextPort
  private readonly profiles: OpenProfilePort

  constructor(sync: SyncMagicContextPort, profiles: OpenProfilePort) {
    this.sync = sync
    this.profiles = profiles
  }

  apply(input: ApplyQueueInput): ApplyQueueOutcome {
    if (input.queue.length === 0) return { result: ["The queue is empty."], changed: false }
    const sides: { left: OpenedProfile; right: OpenedProfile } = { left: input.left, right: input.right }
    const reopened: { left?: OpenedProfile; right?: OpenedProfile } = {}
    const result: string[] = []
    for (const direction of DIRECTIONS) {
      const sessions = requestsFor(input.queue, direction)
      if (sessions === null) return { result: ["Decide every conflict first: r or s on each, or R or S for all."], changed: false }
      if (sessions.length === 0) continue
      const [from, to] = direction === "to-right" ? (["left", "right"] as const) : (["right", "left"] as const)
      try {
        const report = this.sync.sync({ source: syncSideOf(sides[from]), target: syncSideOf(sides[to]), sessions, dryRun: input.dryRun })
        result.push(...syncSummary(report))
        if (report.backup_dir !== null) {
          const fresh = this.profiles.open(sides[to].catalog.profile)
          this.profiles.close(sides[to])
          sides[to] = fresh
          reopened[to] = fresh
        }
      } catch (error) {
        result.push(`Not applied: ${error instanceof Error ? error.message : String(error)}`)
        break
      }
    }
    return { result, changed: reopened.left !== undefined || reopened.right !== undefined, ...reopened }
  }
}
