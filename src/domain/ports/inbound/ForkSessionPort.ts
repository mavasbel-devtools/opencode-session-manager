import type { ForkReport } from "@session-manager/domain/model/Fork"

export interface ForkInput {
  readonly sessionId: string
  /** Fork the history before this message (else the whole history). */
  readonly before: string | null
  /** A server URL instead of the one this machine's OpenCode service recorded. */
  readonly server: string | null
}

/** Inbound port: fork a session through the running OpenCode. */
export interface ForkSessionPort {
  fork(input: ForkInput): Promise<ForkReport>
}
