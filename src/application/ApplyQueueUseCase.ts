import { requestsFor } from "@session-manager/domain/model/BrowserQueue"
import type { Direction, OpenedProfile, PlannedSync } from "@session-manager/domain/model/BrowserState"
import { syncSideOf } from "@session-manager/domain/model/MagicContextSync"
import { contextOutcomeText, sessionSyncLines } from "@session-manager/domain/model/SessionSync"
import type { ApplyQueueInput, ApplyQueueOutcome, ApplyQueuePort } from "@session-manager/domain/ports/inbound/ApplyQueuePort"
import type { OpenProfilePort } from "@session-manager/domain/ports/inbound/OpenProfilePort"
import type { SyncSessionsPort } from "@session-manager/domain/ports/inbound/SyncSessionsPort"

const DIRECTIONS: readonly Direction[] = ["to-right", "to-left"]

/**
 * Carries out the queue: one whole-session sync per direction that has entries, left to right
 * first, each with its own backup of both target stores. After a target changed, its side is read
 * again so the browser shows the new state. An error stops the queue and is reported; a direction
 * already applied stays applied (its report names the rollback).
 */
export class ApplyQueueUseCase implements ApplyQueuePort {
  private readonly sync: SyncSessionsPort
  private readonly profiles: OpenProfilePort

  constructor(sync: SyncSessionsPort, profiles: OpenProfilePort) {
    this.sync = sync
    this.profiles = profiles
  }

  apply(input: ApplyQueueInput): ApplyQueueOutcome {
    if (input.queue.length === 0) return { result: ["The queue is empty."], changed: false, planned: {} }
    const sides: { left: OpenedProfile; right: OpenedProfile } = { left: input.left, right: input.right }
    const reopened: { left?: OpenedProfile; right?: OpenedProfile } = {}
    const result: string[] = []
    const planned: Record<string, PlannedSync> = {}
    for (const direction of DIRECTIONS) {
      const { ids, preferFor, divergedFor } = requestsFor(input.queue, direction)
      if (ids.length === 0) continue
      const [from, to] = direction === "to-right" ? (["left", "right"] as const) : (["right", "left"] as const)
      try {
        const report = this.sync.sync({
          source: syncSideOf(sides[from]),
          target: syncSideOf(sides[to]),
          sessions: ids,
          maps: input.maps,
          prefer: "further",
          preferFor,
          divergedFor,
          context: input.scope,
          dryRun: input.dryRun,
        })
        result.push(`${direction === "to-right" ? "→" : "←"} ${sessionSyncLines(report)[0]!}`, ...sessionSyncLines(report).slice(1))
        for (const outcome of report.sessions)
          planned[outcome.id] = { action: outcome.action, relation: outcome.relation, reason: outcome.reason, context: contextOutcomeText(outcome.context) }
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
    return { result, changed: reopened.left !== undefined || reopened.right !== undefined, planned, ...reopened }
  }
}
