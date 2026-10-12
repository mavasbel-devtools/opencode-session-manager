import type { RebuildCommand, RebuildProgress, RebuildReport } from "@session-manager/domain/model/Rebuild"

export interface RebuildInput {
  readonly contextDb: string
  readonly sessions: readonly string[]
  readonly command: RebuildCommand
  /** `/ctx-wrapup`: the newest messages left raw (Magic Context's default when null). */
  readonly keep: number | null
  /** A server URL instead of the one this machine's OpenCode service recorded. */
  readonly server: string | null
  /** Wait for each session to finish before the next (else: start them all and return). */
  readonly wait: boolean
  /** How long to wait for one session. */
  readonly timeoutMs: number
  readonly pollMs: number
  /** How long a command may show no sign of work before it counts as nothing to do. */
  readonly graceMs: number
  readonly onProgress?: (progress: RebuildProgress) => void
}

/** Inbound port: rebuild sessions' Magic Context state through the running OpenCode. */
export interface RebuildContextPort {
  rebuild(input: RebuildInput): Promise<RebuildReport>
}
