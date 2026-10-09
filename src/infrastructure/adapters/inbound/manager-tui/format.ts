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

/** One list line, exactly `width` columns wide. */
export function rowText(row: BrowserRow, width: number): string {
  if (row.kind === "group") {
    const marked = row.marked === 0 ? "" : ` ${MARKED}${row.marked}`
    return fit(`${row.collapsed ? "▸" : "▾"} ${row.directory} (${row.sessions})${marked}`, width)
  }
  const mark = row.marked ? MARKED : " "
  if (row.kind === "pair") {
    const side = (session: CatalogedSession | null) =>
      session === null ? fit("—", 29) : `${stamp(session.timeUpdated).slice(5)} ${String(session.entries).padStart(5)}m ${counts(session.magicContext)}`
    const right = ` ${side(row.left)} │ ${side(row.right)}`
    const left = `${mark} ${PAIR_MARKS[row.match]} ${(row.left ?? row.right)!.title ?? UNTITLED}`
    const room = width - [...right].length
    return room < 8 ? fit(left, width) : fit(left, room) + right
  }
  const right = ` ${stamp(row.session.timeUpdated)} ${String(row.session.entries).padStart(5)}m ${counts(row.session.magicContext)}`
  const left = `${mark} ${row.match === null ? " " : MATCH_MARKS[row.match]} ${row.session.title ?? UNTITLED}`
  const room = width - [...right].length
  return room < 8 ? fit(left, width) : fit(left, room) + right
}

export function paneTitle(pane: PaneState): string {
  const { catalog } = pane
  const context = catalog.magicContext.available ? `Magic Context format ${catalog.magicContext.schemaVersion ?? "?"}` : "no Magic Context"
  const snapshot = pane.snapshot === null ? "" : " (snapshot)"
  return ` ${catalog.profile.name}${snapshot} · ${catalog.sessions.length} sessions · ${context} · ${catalog.profile.dataHome} `
}

export function pairedTitle(state: BrowserState): string {
  return ` paired by session id · left ${state.left.catalog.profile.dataHome} │ right ${state.right!.catalog.profile.dataHome} `
}

export function queueTitle(state: BrowserState): string {
  const { entries, conflicts, undecided } = queueSummary(state.queue)
  return ` Queue · ${entries} Magic Context ${entries === 1 ? "copy" : "copies"} · ${conflicts} conflicts (${undecided} undecided) `
}

/** One queue line, exactly `width` columns wide. */
export function queueText(entry: QueueEntry, width: number): string {
  const resolution = entry.conflict ? `conflict: ${entry.resolution ?? "undecided"}` : "new on target"
  const right = ` ${counts(entry.source)} N${String(entry.source.notes).padStart(2)} M${String(entry.source.memoriesOriginated).padStart(3)}  ${fit(resolution, 19)}`
  const left = `${entry.direction === "to-right" ? "→" : "←"} ${entry.title ?? UNTITLED}`
  const room = width - [...right].length
  return room < 8 ? fit(left, width) : fit(left, room) + right
}

/** The detail panel for the row under the active cursor, or the queue entry under the queue cursor. */
export function detailLines(state: BrowserState, row: BrowserRow | undefined): string[] {
  if (state.view === "queue") return queueDetail(state.queue[state.queueCursor])
  if (row === undefined) return ["No sessions."]
  if (row.kind === "group") return [`Folder ${row.directory}`, `${row.sessions} sessions${row.collapsed ? " (collapsed)" : ""}${row.marked === 0 ? "" : ` · ${row.marked} marked`}`]
  if (row.kind === "pair") {
    const side = (name: string, session: CatalogedSession | null) =>
      session === null
        ? `${name}: —`
        : `${name}: ${session.directory} · updated ${stamp(session.timeUpdated)} · ${session.entries} messages · ${contextText(session.magicContext)}`
    return [(row.left ?? row.right)!.title ?? UNTITLED, `${row.id} · ${PAIR_TEXT[row.match]}`, side("left ", row.left), side("right", row.right)]
  }
  return sessionDetail(row)
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

function queueDetail(entry: QueueEntry | undefined): string[] {
  if (entry === undefined) return ["The queue is empty: mark sessions (Space) and queue copies with > or <."]
  const [from, to] = entry.direction === "to-right" ? ["left", "right"] : ["right", "left"]
  const { source } = entry
  return [
    entry.title ?? UNTITLED,
    `${entry.id} · copy Magic Context state from the ${from} to the ${to}`,
    `${source.compartments} summaries · ${source.tags} tags · ${source.notes} notes · ${source.memoriesOriginated} memories created · ${source.project ?? "no project"}`,
    entry.conflict
      ? `The ${to} has its own state for this session: ${entry.resolution === null ? "undecided" : entry.resolution === "replace" ? "replace it" : "skip this copy"} (r replace · s skip)`
      : `The ${to} has no state for this session yet.`,
  ]
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
  if (state.view === "queue") return `${notice}↑↓ move · r/s replace/skip · R/S all conflicts · x remove · c clear · Esc back · q quit`
  const filter = state.filter === "" ? "" : `filter "${state.filter}" · `
  if (state.right === null) return `${notice}${filter}↑↓ move · PgUp/PgDn · Enter fold · Space mark · / filter · q quit`
  const layout = state.layout === "panes" ? "Tab pane · p pair" : "p panes"
  return `${notice}${filter}↑↓ · Enter fold · Space/* mark · >/< queue copy · Q queue · ${layout} · / filter · q quit`
}

/** The details panel's title; with two profiles it carries the legend of the match marks. */
export function detailTitle(state: BrowserState): string {
  if (state.right === null || state.view === "queue") return " Details "
  return ` Details · ${state.layout === "panes" ? LEGEND : PAIR_LEGEND} `
}
