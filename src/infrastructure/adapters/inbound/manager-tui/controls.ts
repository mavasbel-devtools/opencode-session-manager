import type { MagicContextReleaseState, QueueEntry } from "@session-manager/domain/model/BrowserState"
import type { ContextScope } from "@session-manager/domain/model/MagicContextSync"
import type { ApplyQueueOutcome } from "@session-manager/domain/ports/inbound/ApplyQueuePort"

/** What the browser asks of the program around it. */
export interface BrowserControls {
  /** Carries out the queue (or only checks it on copies, with `dryRun`) on the profiles currently shown. */
  apply(queue: readonly QueueEntry[], dryRun: boolean, scope: ContextScope): ApplyQueueOutcome
  /** The Magic Context this machine runs, with the newest one published (asked once the browser is shown). */
  release(): Promise<MagicContextReleaseState>
}
