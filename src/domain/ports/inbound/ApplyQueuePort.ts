import type { OpenedProfile, QueueEntry } from "@session-manager/domain/model/BrowserState"

export interface ApplyQueueInput {
  readonly queue: readonly QueueEntry[]
  readonly left: OpenedProfile
  readonly right: OpenedProfile
  readonly dryRun: boolean
}

export interface ApplyQueueOutcome {
  /** What happened, for a person. */
  readonly result: readonly string[]
  /** A target store was replaced. */
  readonly changed: boolean
  /** A side read again after its store changed (the previous one is closed). */
  readonly left?: OpenedProfile
  readonly right?: OpenedProfile
}

/** Inbound port: carry out the browser's queue of Magic Context copies. */
export interface ApplyQueuePort {
  apply(input: ApplyQueueInput): ApplyQueueOutcome
}
