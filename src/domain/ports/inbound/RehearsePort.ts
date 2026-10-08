import type { BuildAndVerifyResult } from "#domain/model/Build.ts"

export interface RehearseInput {
  readonly dbPath: string
  readonly directory: string
  /** Keep the compacted copy instead of deleting it after the rehearsal. */
  readonly keep: boolean
}

export interface RehearseOutcome {
  readonly build: BuildAndVerifyResult
  readonly reportPath: string
}

export interface RehearsePort {
  execute(input: RehearseInput): RehearseOutcome
}
