import {
  queueSummary,
  type BrowserRow,
  type BrowserState,
  type Match,
  type PairMatch,
  type PaneState,
  type QueueEntry,
  type SessionRow,
} from "@session-manager/domain/model/Browser"
import type { CatalogedSession, MagicContextSessionStats } from "@session-manager/domain/model/SessionCatalog"
import { worse, type FindingSeverity, type SessionHealth } from "@session-manager/domain/model/Verify"
import { versionsText } from "@session-manager/domain/model/MagicContextRelease"
import type { ListId } from "@session-manager/domain/model/Browser"

/** Pure text for the browser: everything the view paints, so the view itself only lays it out. */

export const MATCH_MARKS: Readonly<Record<Match, string>> = {
  "only-here": "+",
  same: "=",
  "newer-here": ">",
  "older-here": "<",
}

export const PAIR_MARKS: Readonly<Record<PairMatch, string>> = {
  "left-only": "L",
  "right-only": "R",
  same: "=",
  "left-newer": ">",
  "right-newer": "<",
}

export const LEGEND = "+ only here  = same  > newer here  < older here"
export const PAIR_LEGEND = "L left only  R right only  = same  > left newer  < right newer"

const UNTITLED = "(untitled)"
const MARKED = "●"

/** The list's health column: `!` an error-level finding, `~` a warning, blank otherwise. */
export const HEALTH_MARKS: Readonly<Record<FindingSeverity, string>> = { error: "!", warning: "~", info: " " }

function healthOfPane(state: BrowserState, side: "left" | "right", id: string): SessionHealth | null {
  const pane = side === "left" ? state.left : state.right
  return pane?.health?.[id] ?? null
}

/** The most serious finding about a list row's session (on both sides, in the paired list). */
export function rowSeverity(state: BrowserState, list: ListId, row: BrowserRow): FindingSeverity | null {
  if (row.kind === "group") return null
  if (row.kind === "pair") return worse(healthOfPane(state, "left", row.id)?.worst ?? null, healthOfPane(state, "right", row.id)?.worst ?? null)
  return healthOfPane(state, list === "right" ? "right" : "left", row.session.id)?.worst ?? null
}

export function stamp(milliseconds: number): string {
  return new Date(milliseconds).toISOString().slice(0, 16).replace("T", " ")
}

/** Fits text into `width` columns: cut with `…` when longer, padded with spaces when shorter. */
export function fit(text: string, width: number): string {
  if (width <= 0) return ""
  const chars = [...text]
  if (chars.length > width) return `${chars.slice(0, width - 1).join("")}…`
  return text + " ".repeat(width - chars.length)
}

/** Summaries and tags, in a fixed width. */
function counts(context: MagicContextSessionStats | null): string {
  return context === null ? " ".repeat(10) : `S${String(context.compartments).padStart(2)} T${String(context.tags).padStart(5)}`
}

/** One list line, exactly `width` columns wide; `severity` fills the health column after the mark. */
export function rowText(row: BrowserRow, width: number, severity: FindingSeverity | null = null): string {
  if (row.kind === "group") {
    const marked = row.marked === 0 ? "" : ` ${MARKED}${row.marked}`
    return fit(`${row.collapsed ? "▸" : "▾"} ${row.directory} (${row.sessions})${marked}`, width)
  }
  const mark = (row.marked ? MARKED : " ") + (severity === null ? " " : HEALTH_MARKS[severity])
  if (row.kind === "pair") {
    const side = (session: CatalogedSession | null) =>
      session === null ? fit("—", 29) : `${stamp(session.timeUpdated).slice(5)} ${String(session.entries).padStart(5)}m ${counts(session.magicContext)}`
    const right = ` ${side(row.left)} │ ${side(row.right)}`
    const left = `${mark}${PAIR_MARKS[row.match]} ${(row.left ?? row.right)!.title ?? UNTITLED}`
    const room = width - [...right].length
    return room < 8 ? fit(left, width) : fit(left, room) + right
  }
  const right = ` ${stamp(row.session.timeUpdated)} ${String(row.session.entries).padStart(5)}m ${counts(row.session.magicContext)}`
  const left = `${mark}${row.match === null ? " " : MATCH_MARKS[row.match]} ${row.session.title ?? UNTITLED}`
  const room = width - [...right].length
  return room < 8 ? fit(left, width) : fit(left, room) + right
}

export function paneTitle(pane: PaneState): string {
  const { catalog } = pane
  const context = catalog.magicContext.available ? `Magic Context format ${catalog.magicContext.schemaVersion ?? "?"}` : "no Magic Context"
  const snapshot = pane.snapshot === null ? "" : " (snapshot)"
  return ` ${catalog.profile.name}${snapshot} · ${catalog.sessions.length} sessions · ${context}${healthTotals(pane.health)} · ${catalog.profile.dataHome} `
}

/** `· 2! 5~` (sessions with an error, with a warning) when the side was checked. */
function healthTotals(health: Readonly<Record<string, SessionHealth>> | undefined): string {
  if (health === undefined) return ""
  const all = Object.values(health)
  const errors = all.filter((entry) => entry.worst === "error").length
  const warnings = all.filter((entry) => entry.worst === "warning").length
  return ` · health ${errors}! ${warnings}~`
}

const WRAPUP_TEXT = { none: "", running: " · wrapup running", "left-behind": " · wrapup interrupted" } as const

/** One line about a session's health, or why there is none. */
export function healthLine(health: SessionHealth | null | undefined): string {
  if (health === undefined) return "Health: not checked"
  if (health === null || health.session === null) return "Health: nothing known"
  const { session, findings } = health
  const progress =
    session.summaries === 0
      ? `${session.unsummarized === null ? "no Magic Context state" : "no summaries"} for its ${session.messages} messages`
      : session.unsummarized === null
        ? `${session.summaries} summaries, ending past its history`
        : `${session.unsummarized} of ${session.messages} messages after the newest of ${session.summaries} summaries`
  const prompt = session.last_context_percentage === null ? "" : ` · last prompt ${session.last_context_percentage.toFixed(1)} % of the window`
  const found = findings.length === 0 ? " · ok" : ` · ${findings.map((entry) => `${HEALTH_MARKS[entry.severity].trim() || "i"} ${entry.kind}`).join(", ")}`
  return `Health: ${progress}${prompt}${WRAPUP_TEXT[session.wrapup ?? "none"]}${found}`
}

export function pairedTitle(state: BrowserState): string {
  return ` paired by session id · left ${state.left.catalog.profile.dataHome} │ right ${state.right!.catalog.profile.dataHome} `
}

export function queueTitle(state: BrowserState): string {
  const { entries, new: fresh, diverged } = queueSummary(state.queue)
  const scope = state.scope === "all" ? "Magic Context: sessions and their projects" : "Magic Context: sessions only"
  return ` Queue · ${entries} session ${entries === 1 ? "sync" : "syncs"} · ${fresh} new on the target${diverged === 0 ? "" : ` · ${diverged} diverged`} · ${scope} `
}

/** What a queued sync does: the dry run's answer once there is one, else what the two catalogs suggest. */
export function plannedText(entry: QueueEntry): string {
  const planned = entry.planned
  if (planned === null) return entry.target === null ? "new: copy" : "both: d to check"
  if (planned.action === "skip") return planned.reason === "diverged" ? "diverged: skipped" : `skipped (${planned.reason})`
  if (planned.action === "keep") return planned.context === "Magic Context copied" ? "same: context only" : "same: nothing"
  return planned.action === "copy" ? "copy" : "replace (target behind)"
}

/** One queue line, exactly `width` columns wide. */
export function queueText(entry: QueueEntry, width: number): string {
  const right = ` ${String(entry.source.entries).padStart(5)}m ${counts(entry.source.magicContext)}  ${fit(entry.prefer, 7)} ${fit(plannedText(entry), 24)}`
  const left = `${entry.direction === "to-right" ? "→" : "←"} ${entry.title ?? UNTITLED}`
  const room = width - [...right].length
  return room < 8 ? fit(left, width) : fit(left, room) + right
}

/** The detail panel for the row under the active cursor, or the queue entry under the queue cursor. */
export function detailLines(state: BrowserState, row: BrowserRow | undefined): string[] {
  if (state.view === "queue")
    return state.queue.length === 0 && state.lastResult !== null ? [...state.lastResult] : queueDetail(state.queue[state.queueCursor])
  if (row === undefined) return ["No sessions."]
  if (row.kind === "group") return [`Folder ${row.directory}`, `${row.sessions} sessions${row.collapsed ? " (collapsed)" : ""}${row.marked === 0 ? "" : ` · ${row.marked} marked`}`]
  if (row.kind === "pair") {
    const side = (name: string, session: CatalogedSession | null) =>
      session === null
        ? `${name}: —`
        : `${name}: ${session.directory} · updated ${stamp(session.timeUpdated)} · ${session.entries} messages · ${contextText(session.magicContext)}`
    return [
      (row.left ?? row.right)!.title ?? UNTITLED,
      `${row.id} · ${PAIR_TEXT[row.match]}`,
      side("left ", row.left),
      side("right", row.right),
      ...(row.left === null ? [] : [`left  ${healthLine(healthFor(state, "left", row.id))}`]),
      ...(row.right === null ? [] : [`right ${healthLine(healthFor(state, "right", row.id))}`]),
    ]
  }
  return [...sessionDetail(row), ...healthDetail(healthFor(state, state.focus, row.session.id))]
}

const PAIR_TEXT: Readonly<Record<PairMatch, string>> = {
  "left-only": "only on the left",
  "right-only": "only on the right",
  same: "same on both sides",
  "left-newer": "newer on the left",
  "right-newer": "newer on the right",
}

function contextText(context: MagicContextSessionStats | null): string {
  return context === null ? "no Magic Context" : `${context.compartments} summaries, ${context.tags} tags`
}

const PREFER_TEXT = {
  further: "the side whose summaries reach further",
  keep: "the target's own",
  replace: "the source's",
} as const

function queueDetail(entry: QueueEntry | undefined): string[] {
  if (entry === undefined) return ["The queue is empty: mark sessions (Space) and queue syncs with > or <."]
  const [from, to] = entry.direction === "to-right" ? ["left", "right"] : ["right", "left"]
  const side = (session: CatalogedSession | null) => (session === null ? "—" : `${session.entries} messages · ${contextText(session.magicContext)} · updated ${stamp(session.timeUpdated)}`)
  const planned = entry.planned
  return [
    entry.title ?? UNTITLED,
    `${entry.id} · sync the session and its Magic Context state from the ${from} to the ${to}`,
    `${from}: ${side(entry.source)}`,
    `${to}: ${side(entry.target)}`,
    planned === null
      ? `Not checked yet (d). Same history on both sides → Magic Context state from ${PREFER_TEXT[entry.prefer]} (r changes)`
      : `${plannedText(entry)}${planned.relation === null ? "" : ` · histories: ${planned.relation}`}${planned.context === null ? "" : ` · ${planned.context}`}`,
  ]
}

/** A session's health on one side: undefined when the side was not checked, null when the check does not know it. */
function healthFor(state: BrowserState, side: "left" | "right", id: string): SessionHealth | null | undefined {
  const health = (side === "left" ? state.left : state.right)?.health
  return health === undefined ? undefined : (health[id] ?? null)
}

/** The health line, and the most serious finding's own words. */
function healthDetail(health: SessionHealth | null | undefined): string[] {
  const first = health?.findings.find((entry) => entry.severity === health.worst)
  return [healthLine(health), ...(first === undefined ? [] : [`  ${first.kind}: ${first.detail}`])]
}

function sessionDetail(row: SessionRow): string[] {
  const { session } = row
  const context = session.magicContext
  const lineage = [
    session.parentId === null ? null : `sub-agent of ${session.parentId}`,
    session.forkOf === null ? null : `fork of ${session.forkOf}`,
    session.timeArchived === null ? null : `archived ${stamp(session.timeArchived)}`,
  ].filter((entry) => entry !== null)
  return [
    `${session.title ?? UNTITLED}`,
    `${session.id} · ${session.generation} · project ${session.projectId}${lineage.length === 0 ? "" : ` · ${lineage.join(" · ")}`}`,
    `${session.directory}`,
    `created ${stamp(session.timeCreated)} · updated ${stamp(session.timeUpdated)} · ${session.entries} messages`,
    context === null
      ? "Magic Context: nothing stored for this session"
      : `Magic Context: ${context.compartments} summaries · ${context.tags} tags (last §${context.lastTag ?? "-"}) · ${context.notes} notes · ${context.memoriesOriginated} memories created · ${context.project ?? "no project"}`,
  ]
}

export function footerText(state: BrowserState): string {
  if (state.editingFilter) return `filter: ${state.filter}▏  Enter keep · Esc clear`
  const notice = state.notice === null ? "" : `${state.notice}   `
  if (state.view === "queue") return `${notice}d dry run · a apply · r/R Magic Context preference (one/all) · t scope · x remove · c clear · Esc back · q quit`
  const filter = state.filter === "" ? "" : `filter "${state.filter}" · `
  if (state.right === null) return `${notice}${filter}↑↓ move · PgUp/PgDn · Enter fold · Space mark · W/R wrapup/rebuild · / filter · q quit`
  const layout = state.layout === "panes" ? "Tab pane · p pair" : "p panes"
  return `${notice}${filter}↑↓ · Enter fold · Space/* mark · >/< queue sync · Q queue · W/R wrapup/rebuild · ${layout} · / filter · q quit`
}

/** The header line: the Magic Context this machine runs and what npm has. */
export function headerText(state: BrowserState): string {
  return state.release === null ? "Magic Context: …" : ` ${versionsText(state.release.versions, state.release.newer)}`
}

/** The details panel's title; with two profiles it carries the legend of the match marks. */
export function detailTitle(state: BrowserState): string {
  if (state.right === null || state.view === "queue") return " Details "
  return ` Details · ${state.layout === "panes" ? LEGEND : PAIR_LEGEND} `
}
