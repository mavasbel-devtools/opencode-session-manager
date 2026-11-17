import type { FollowStep, FollowStepName } from "@session-manager/domain/model/patches/Reports"
import type { ClockPort } from "@session-manager/domain/ports/outbound/ClockPort"

/** The steps of one `follow` or rollback run, in order, each passed or failed with what it found and how long it took. */
export interface StepLog {
  pass(step: FollowStepName, detail: string): true
  fail(step: FollowStepName, detail: string): false
  steps(): readonly FollowStep[]
  /** The detail of the first failed step, or null when none failed. */
  failure(): string | null
}

/**
 * A fresh step log on `clock`. A factory function, not a constructible type: use cases may not
 * run `new` on anything defined in `src` (only `main/*-container.ts` constructs), so the
 * bookkeeping lives here.
 */
export function stepLog(clock: ClockPort): StepLog {
  const entries: FollowStep[] = []
  let mark = clock.now()
  const add = (step: FollowStepName, ok: boolean, detail: string): void => {
    const now = clock.now()
    entries.push({ step, ok, detail, ms: now - mark })
    mark = now
  }
  return {
    pass(step, detail) {
      add(step, true, detail)
      return true
    },
    fail(step, detail) {
      add(step, false, detail)
      return false
    },
    steps() {
      return [...entries]
    },
    failure() {
      const failed = entries.find((entry) => !entry.ok)
      return failed === undefined ? null : `${failed.step}: ${failed.detail}`
    },
  }
}
