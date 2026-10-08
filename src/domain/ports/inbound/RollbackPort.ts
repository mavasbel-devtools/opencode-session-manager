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
}
