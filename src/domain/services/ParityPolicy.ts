import type { BuildChecks } from "@session-manager/domain/model/Build"

/**
 * Decides whether a build passed. `parity_ok` is required only for a strict (offline) run: a
 * rehearsal against a live source reports drift instead of failing on it.
 */
export class ParityPolicy {
  constructor() {}

  ok(checks: BuildChecks, strict: boolean): boolean {
    const values = strict
      ? Object.values(checks)
      : Object.entries(checks)
          .filter(([name]) => name !== "parity_ok")
          .map(([, value]) => value)
    return values.every(Boolean)
  }
}
