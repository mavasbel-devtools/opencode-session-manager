/**
 * Rebuilding a session's Magic Context state through the OpenCode server that runs it: Magic
 * Context's own `/ctx-wrapup` (summarise what lags, keep the newest N messages raw) or
 * `/ctx-recomp` (rebuild every summary from the first message; memories untouched). The server
 * runs the command in the background and answers nothing about it, so progress is read from the
 * Magic Context store. Report keys are snake_case.
 */
export type RebuildCommand = "wrapup" | "recomp"

/** How often a running rebuild is looked at, how long it may show no sign of work, and the default wait. */
export const REBUILD_POLL_MS = 10_000
export const REBUILD_GRACE_MS = 60_000
export const REBUILD_TIMEOUT_MINUTES = 180

export function isRebuildCommand(value: string): value is RebuildCommand {
  return value === "wrapup" || value === "recomp"
}

/** Where the OpenCode server listens, and its password (null: none set). */
export interface ServerConnection {
  readonly url: string
  readonly password: string | null
}

/** What the server said to a command. */
export type CommandAnswer =
  | { readonly ok: true }
  | { readonly ok: false; readonly status: number | null; readonly detail: string }

/** One historian run Magic Context recorded. */
export interface HistorianRun {
  readonly kind: string
  readonly status: string
  readonly failure: string | null
  readonly chunk_start: number | null
  readonly chunk_end: number | null
  readonly compartments: number
  readonly at: number
}

/** A session's Magic Context progress at one moment (read-only). */
export interface RebuildSnapshot {
  readonly summaries: number
  /** Magic Context's message number the newest summary ends at, or null without summaries. */
  readonly reach: number | null
  readonly wrapup: "none" | "running" | "left-behind"
  /** A history lease that has not run out: Magic Context is writing the session's summaries. */
  readonly leased: boolean
  /** Summaries a recomp has staged and not published yet. */
  readonly staged: number
  /** Historian runs recorded at or after the time asked for, oldest first. */
  readonly runs: readonly HistorianRun[]
}

/** Where a started rebuild stands. */
export type RebuildPhase = "running" | "finished" | "failed" | "stopped" | "quiet"

/**
 * - running: a wrapup marker, an unexpired lease or staged summaries;
 * - stopped: a wrapup marker whose time ran out (the server stopped, or the wrapup was cut off);
 * - failed: the newest run since the start failed;
 * - finished: a run since the start succeeded (or had nothing to do);
 * - quiet: nothing at all since the start (Magic Context found nothing to do, or has not begun yet).
 */
export function phaseOf(snapshot: RebuildSnapshot): RebuildPhase {
  if (snapshot.wrapup === "running" || snapshot.leased || snapshot.staged > 0) return "running"
  if (snapshot.wrapup === "left-behind") return "stopped"
  const last = snapshot.runs.at(-1)
  if (last === undefined) return "quiet"
  return last.status === "failed" ? "failed" : "finished"
}

/**
 * - finished, failed, stopped: as the phase says, once the command had run;
 * - nothing-to-do: Magic Context never started (no run, no marker) within the grace time;
 * - refused: the server would not take the command, or the session was busy before;
 * - started: not waited for (`--no-wait`);
 * - timed-out: still running when the wait ended (it carries on in OpenCode).
 */
export type RebuildStatus = "finished" | "failed" | "stopped" | "nothing-to-do" | "refused" | "started" | "timed-out"

export interface SessionRebuild {
  readonly session_id: string
  readonly command: RebuildCommand
  readonly status: RebuildStatus
  readonly detail: string | null
  readonly summaries_before: number
  readonly summaries_after: number
  readonly reach_before: number | null
  readonly reach_after: number | null
  /** Historian runs since the command, and how many of them failed. */
  readonly runs: number
  readonly failed_runs: number
  readonly elapsed_ms: number
}

export interface RebuildReport {
  readonly server: string
  readonly context_db: string
  readonly command: RebuildCommand
  readonly sessions: readonly SessionRebuild[]
  /** Every session finished, started (not waited for) or had nothing to do. */
  readonly ok: boolean
}

/** A progress event while waiting, for a person. */
export interface RebuildProgress {
  readonly session_id: string
  readonly snapshot: RebuildSnapshot
  readonly elapsed_ms: number
}

const OK: ReadonlySet<RebuildStatus> = new Set(["finished", "started", "nothing-to-do"])

export function rebuildOk(sessions: readonly SessionRebuild[]): boolean {
  return sessions.every((session) => OK.has(session.status))
}

/** One line about a session's progress. */
export function progressText(progress: RebuildProgress): string {
  const { snapshot } = progress
  const reach = snapshot.reach === null ? "no summaries" : `${snapshot.summaries} summaries to message ${snapshot.reach}`
  const last = snapshot.runs.at(-1)
  const run = last === undefined ? "" : ` · last run ${last.status}${last.chunk_start === null ? "" : ` (${last.chunk_start}–${last.chunk_end})`}`
  return `${progress.session_id}: ${phaseOf(snapshot)} · ${reach}${run} · ${Math.round(progress.elapsed_ms / 1000)} s`
}

/** A rebuild report for a person. */
export function rebuildLines(report: RebuildReport): string[] {
  const reach = (value: number | null) => (value === null ? "none" : `to message ${value}`)
  const statuses = new Map<RebuildStatus, number>()
  for (const session of report.sessions) statuses.set(session.status, (statuses.get(session.status) ?? 0) + 1)
  return [
    `/ctx-${report.command} through ${report.server}: ${[...statuses].map(([status, total]) => `${total} ${status}`).join(", ") || "no sessions"}`,
    ...report.sessions.map(
      (session) =>
        `${session.session_id}: ${session.status}${session.detail === null ? "" : ` (${session.detail})`} · summaries ${session.summaries_before} → ${session.summaries_after}, ${reach(session.reach_before)} → ${reach(session.reach_after)} · ${session.runs} runs (${session.failed_runs} failed) · ${Math.round(session.elapsed_ms / 1000)} s`,
    ),
    report.ok ? "OK" : "NOT ALL DONE: see each session above",
  ]
}
