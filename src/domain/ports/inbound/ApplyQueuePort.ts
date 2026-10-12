import type { OpenedProfile, PlannedSync, QueueEntry } from "@session-manager/domain/model/BrowserState"
import type { ContextScope } from "@session-manager/domain/model/MagicContextSync"
import type { MapRule } from "@session-manager/domain/model/SessionSync"

export interface ApplyQueueInput {
  readonly queue: readonly QueueEntry[]
  readonly left: OpenedProfile
  readonly right: OpenedProfile
  readonly dryRun: boolean
  /** Path rules (`--map`), as for `sync`. */
  readonly maps: readonly MapRule[]
  readonly scope: ContextScope
}

export interface ApplyQueueOutcome {
  /** What happened, for a person. */
  readonly result: readonly string[]
  /** A target store was replaced. */
  readonly changed: boolean
  /** What the run did with each queued session, by id. */
  readonly planned: Readonly<Record<string, PlannedSync>>
  /** A side read again after its store changed (the previous one is closed). */
  readonly left?: OpenedProfile
  readonly right?: OpenedProfile
}

/** Inbound port: carry out the browser's queue of whole-session syncs. */
export interface ApplyQueuePort {
  apply(input: ApplyQueueInput): ApplyQueueOutcome
}
