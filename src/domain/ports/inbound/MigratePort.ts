import type { MigrationInputs, MigrationVerification, RekeyReport, RewriteReport, MergeReport } from "@session-manager/domain/model/Migration"

export type MigrateMode = "rehearse" | "run"

export interface MigrateInput extends MigrationInputs {
  readonly mode: MigrateMode
  /** Where the working copies are built: the rehearsal folder, or the database's own folder for a run. */
  readonly directory: string
  /** Keep the working copies after a rehearsal. */
  readonly keep: boolean
  readonly image: string
}

export interface MigrateOutcome {
  readonly ok: boolean
  readonly swapped: boolean
  readonly rewrites: readonly RewriteReport[]
  readonly merges: readonly MergeReport[]
  readonly rekey: RekeyReport
  readonly verification: MigrationVerification
  readonly reportPath: string
  /** The migrated copy, while it still exists: kept by a rehearsal with `keep`, or by a failed run. */
  readonly migrated: string | null
  readonly backupDir: string | null
  readonly postIntegrityOk: boolean
}

export interface MigratePort {
  execute(input: MigrateInput): MigrateOutcome
}
