export interface RollbackInput {
  readonly dbPath: string
  readonly backupDir: string
  readonly image: string
}

export interface RollbackOutcome {
  readonly restored: readonly string[]
  /** Where the compacted files that were in place got parked. */
  readonly parked: string
}

export interface RollbackPort {
  execute(input: RollbackInput): RollbackOutcome
  /** Restores several databases from one backup folder; refuses before restoring any when one has no original there. */
  executeAll(input: Omit<RollbackInput, "dbPath"> & { readonly dbPaths: readonly string[] }): readonly RollbackOutcome[]
}
