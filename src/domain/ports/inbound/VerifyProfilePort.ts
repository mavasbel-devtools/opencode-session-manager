import type { CatalogedSession } from "@session-manager/domain/model/SessionCatalog"
import type { VerifyInput, VerifyReport } from "@session-manager/domain/model/Verify"

/** The profile's sessions with their Magic Context state, as opened (`OpenProfilePort`). */
export interface VerifyCatalog {
  readonly sessions: readonly CatalogedSession[]
}

/** Checks a profile's stores and sessions, reading only. */
export interface VerifyProfilePort {
  verify(input: VerifyInput, catalog: VerifyCatalog): VerifyReport
}
