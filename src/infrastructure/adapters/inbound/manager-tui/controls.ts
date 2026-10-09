import type { QueueEntry } from "@session-manager/domain/model/BrowserState"
import type { ApplyQueueOutcome } from "@session-manager/domain/ports/inbound/ApplyQueuePort"

/** What the browser asks of the program around it. */
export interface BrowserControls {
  /** Carries out the queue (or only checks it, with `dryRun`) on the profiles currently shown. */
  apply(queue: readonly QueueEntry[], dryRun: boolean): ApplyQueueOutcome
}
