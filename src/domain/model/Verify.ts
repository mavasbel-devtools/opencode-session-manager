import type { StoreHealth } from "@session-manager/domain/ports/outbound/MagicContextSyncStorePort"

/** What Magic Context records about a session's progress (read-only, from `context.db`). */
export interface SessionVitals {
  /** The message the newest summary ends at, or null without summaries. */
  readonly lastSummarizedMessageId: string | null
  /** `none`, a wrapup in progress, or a wrapup marker whose time ran out (left by an interrupted run). */
  readonly wrapup: "none" | "running" | "left-behind"
  /** The last prompt's share of the model's context window, in percent (null when never recorded). */
  readonly lastContextPercentage: number | null
  readonly lastInputTokens: number | null
}

export type FindingSeverity = "error" | "warning" | "info"

/**
 * - `store-integrity`, `store-foreign-keys`: a store fails SQLite's own checks (error);
 * - `over-limit`: the session's last prompt was larger than the model's window, so every turn fails (error);
 * - `near-limit`: the last prompt used 90 % or more of the window (warning);
 * - `summaries-behind`: more messages than the threshold after the newest summary (warning);
 * - `stale-summaries`: summaries point at messages the session's history no longer holds (warning);
 * - `wrapup-left-behind`: a wrapup marker whose time ran out (warning); `wrapup-running` (info);
 * - `project-mismatch`: the session's project id is not the one OpenCode derives for its folder now
 *   (OpenCode 2.0.26 still lists it by folder; a project-wide view groups it elsewhere) (warning);
 * - `context-project-mismatch`: Magic Context's project for the session is not the one it derives for
 *   the folder, so the project's memories are not given to it (warning);
 * - `orphan-context-state`: Magic Context session state (summaries, tags, notes) for a session the
 *   OpenCode store does not have; memories are the project's and are not counted (warning);
 * - `session-not-found`: a `--session` the profile does not have (warning).
 */
export type FindingKind =
  | "store-integrity"
  | "store-foreign-keys"
  | "over-limit"
  | "near-limit"
  | "summaries-behind"
  | "stale-summaries"
  | "wrapup-left-behind"
  | "wrapup-running"
  | "project-mismatch"
  | "context-project-mismatch"
  | "orphan-context-state"
  | "session-not-found"

export const SEVERITY: Readonly<Record<FindingKind, FindingSeverity>> = {
  "store-integrity": "error",
  "store-foreign-keys": "error",
  "over-limit": "error",
  "near-limit": "warning",
  "summaries-behind": "warning",
  "stale-summaries": "warning",
  "wrapup-left-behind": "warning",
  "wrapup-running": "info",
  "project-mismatch": "warning",
  "context-project-mismatch": "warning",
  "orphan-context-state": "warning",
  "session-not-found": "warning",
}

export interface Finding {
  readonly severity: FindingSeverity
  readonly kind: FindingKind
  /** The session concerned, or null for a store finding. */
  readonly session_id: string | null
  readonly detail: string
}

export interface VerifiedSession {
  readonly id: string
  readonly title: string | null
  readonly directory: string
  readonly messages: number
  readonly summaries: number
  /** Messages after the newest summary (all of them without summaries), or null when the end is not in the history. */
  readonly unsummarized: number | null
  readonly last_context_percentage: number | null
  readonly wrapup: SessionVitals["wrapup"] | null
}

export interface VerifyInput {
  readonly opencodeDb: string
  readonly contextDb: string
  readonly readableOpencodeDb: string | null
  readonly readableContextDb: string | null
  /** Session ids, or every session of the profile. */
  readonly sessions: readonly string[] | "all"
  /** `summaries-behind` past this many unsummarized messages. */
  readonly behind: number
}

export interface VerifyReport {
  readonly opencode_db: string
  readonly context_db: string | null
  readonly magic_context_format: number | null
  readonly checks: { readonly opencode: StoreHealth; readonly context: StoreHealth | null }
  readonly sessions_checked: number
  readonly sessions: readonly VerifiedSession[]
  readonly findings: readonly Finding[]
  readonly counts: Readonly<Record<FindingSeverity, number>>
  /** No error-level finding. */
  readonly ok: boolean
}

export const DEFAULT_BEHIND = 300
export const NEAR_LIMIT_PERCENT = 90

export function finding(kind: FindingKind, sessionId: string | null, detail: string): Finding {
  return { severity: SEVERITY[kind], kind, session_id: sessionId, detail }
}

/** Findings about one session's Magic Context progress. */
export function vitalsFindings(id: string, vitals: SessionVitals, unsummarized: number | null, behind: number): Finding[] {
  const found: Finding[] = []
  const percent = vitals.lastContextPercentage
  const tokens = vitals.lastInputTokens === null ? "" : ` (${vitals.lastInputTokens} tokens)`
  if (percent !== null && percent >= 100) found.push(finding("over-limit", id, `last prompt at ${percent.toFixed(1)} % of the window${tokens}; run /ctx-wrapup in it`))
  else if (percent !== null && percent >= NEAR_LIMIT_PERCENT) found.push(finding("near-limit", id, `last prompt at ${percent.toFixed(1)} % of the window${tokens}`))
  if (unsummarized !== null && unsummarized > behind) {
    const where = vitals.lastSummarizedMessageId === null ? `no summaries for its ${unsummarized} messages` : `${unsummarized} messages after the newest summary`
    found.push(finding("summaries-behind", id, `${where} (threshold ${behind}); /ctx-wrapup catches up`))
  }
  if (vitals.wrapup === "running") found.push(finding("wrapup-running", id, "a wrapup is in progress"))
  if (vitals.wrapup === "left-behind") found.push(finding("wrapup-left-behind", id, "a wrapup marker whose time ran out: an interrupted wrapup; run /ctx-wrapup again"))
  return found
}

export function countBySeverity(findings: readonly Finding[]): Record<FindingSeverity, number> {
  const counts: Record<FindingSeverity, number> = { error: 0, warning: 0, info: 0 }
  for (const entry of findings) counts[entry.severity] += 1
  return counts
}

/** A verify report for a person: the stores, then each finding, then the verdict. */
export function verifyLines(report: VerifyReport): string[] {
  const health = (name: string, path: string | null, checks: StoreHealth | null) =>
    checks === null ? `${name}: none` : `${name}: ${path} — integrity ${checks.integrity_ok ? "ok" : "FAILED"}, foreign keys ${checks.foreign_keys_ok ? "ok" : "FAILED"}`
  const label: Record<FindingSeverity, string> = { error: "ERROR", warning: "WARN ", info: "INFO " }
  const { error, warning, info } = report.counts
  return [
    health("opencode.db", report.opencode_db, report.checks.opencode),
    health(`context.db${report.magic_context_format === null ? "" : ` (format ${report.magic_context_format})`}`, report.context_db, report.checks.context),
    `${report.sessions_checked} sessions checked`,
    ...report.findings.map((entry) => `${label[entry.severity]} ${entry.kind}${entry.session_id === null ? "" : ` ${entry.session_id}`}: ${entry.detail}`),
    `${report.ok ? "OK" : "PROBLEMS"}: ${error} errors, ${warning} warnings, ${info} notes`,
  ]
}

/** One session's health in a profile: its verified progress and what was found about it. */
export interface SessionHealth {
  readonly session: VerifiedSession | null
  readonly findings: readonly Finding[]
  /** The most serious finding, or null when there is none. */
  readonly worst: FindingSeverity | null
}

const RANK: Readonly<Record<FindingSeverity, number>> = { info: 0, warning: 1, error: 2 }

/** The more serious of two severities (null: nothing found). */
export function worse(a: FindingSeverity | null, b: FindingSeverity | null): FindingSeverity | null {
  if (a === null) return b
  if (b === null) return a
  return RANK[b] > RANK[a] ? b : a
}

/** A verify report by session id; findings about the stores themselves are left to the report. */
export function healthBySession(report: VerifyReport): Record<string, SessionHealth> {
  const health: Record<string, SessionHealth> = {}
  for (const session of report.sessions) health[session.id] = { session, findings: [], worst: null }
  for (const entry of report.findings) {
    if (entry.session_id === null || !Object.hasOwn(health, entry.session_id)) continue
    const current = health[entry.session_id]!
    health[entry.session_id] = { ...current, findings: [...current.findings, entry], worst: worse(current.worst, entry.severity) }
  }
  return health
}
