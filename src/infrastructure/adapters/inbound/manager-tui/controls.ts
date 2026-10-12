import type { MagicContextReleaseState, OpenedProfile, QueueEntry, RebuildRequest } from "@session-manager/domain/model/BrowserState"
import type { ContextScope } from "@session-manager/domain/model/MagicContextSync"
import type { ApplyQueueOutcome } from "@session-manager/domain/ports/inbound/ApplyQueuePort"

/** What the browser asks of the program around it. */
export interface BrowserControls {
  /** Carries out the queue (or only checks it on copies, with `dryRun`) on the profiles currently shown. */
  apply(queue: readonly QueueEntry[], dryRun: boolean, scope: ContextScope): ApplyQueueOutcome
  /** The Magic Context this machine runs, with the newest one published (asked once the browser is shown). */
  release(): Promise<MagicContextReleaseState>
  /** Runs a rebuild through the OpenCode server, telling each step; the side is read again afterwards. */
  rebuild(request: RebuildRequest, onProgress: (text: string) => void): Promise<RebuildOutcome>
}

export interface RebuildOutcome {
  readonly result: readonly string[]
  readonly left?: OpenedProfile
  readonly right?: OpenedProfile
}
