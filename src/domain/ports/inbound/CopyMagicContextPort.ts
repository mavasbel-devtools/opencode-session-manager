import type { ContextCopyReport } from "@session-manager/domain/model/MagicContextRelease"

export interface ContextCopyInput {
  readonly source: string
  readonly target: string
}

/** Inbound port: copy a Magic Context store and bring the copy to the installed format. The source is only read. */
export interface CopyMagicContextPort {
  copy(input: ContextCopyInput): ContextCopyReport
}
