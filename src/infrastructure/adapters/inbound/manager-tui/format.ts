import type { BrowserRow, BrowserState, Match, PaneState, SessionRow } from "@session-manager/domain/model/Browser"

/** Pure text for the browser: everything the view paints, so the view itself only lays it out. */

export const MATCH_MARKS: Readonly<Record<Match, string>> = {
  "only-here": "+",
  same: "=",
  "newer-here": ">",
  "older-here": "<",
}

export const LEGEND = "+ only here  = same  > newer here  < older here"

const UNTITLED = "(untitled)"

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

/** One list line, exactly `width` columns wide. */
export function rowText(row: BrowserRow, width: number): string {
  if (row.kind === "group") return fit(`${row.collapsed ? "▸" : "▾"} ${row.directory} (${row.sessions})`, width)
  const context = row.session.magicContext
  const right = ` ${stamp(row.session.timeUpdated)} ${String(row.session.entries).padStart(5)}m ${
    context === null ? "      " : `S${String(context.compartments).padStart(2)} T${String(context.tags).padStart(5)}`
  }`
  const mark = row.match === null ? " " : MATCH_MARKS[row.match]
  const left = `  ${mark} ${row.session.title ?? UNTITLED}`
  const room = width - [...right].length
  return room < 8 ? fit(left, width) : fit(left, room) + right
}

export function paneTitle(pane: PaneState): string {
  const { catalog } = pane
  const context = catalog.magicContext.available ? `Magic Context format ${catalog.magicContext.schemaVersion ?? "?"}` : "no Magic Context"
  const snapshot = pane.snapshot === null ? "" : " (snapshot)"
  return ` ${catalog.profile.name}${snapshot} · ${catalog.sessions.length} sessions · ${context} · ${catalog.profile.dataHome} `
}

/** The detail panel for the row under the focused cursor. */
export function detailLines(row: BrowserRow | undefined): string[] {
  if (row === undefined) return ["No sessions."]
  if (row.kind === "group") return [`Folder ${row.directory}`, `${row.sessions} sessions${row.collapsed ? " (collapsed)" : ""}`]
  return sessionDetail(row)
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
  const filter = state.filter === "" ? "" : `filter "${state.filter}" · `
  const panes = state.right === null ? "" : "Tab/←→ pane · "
  return `${filter}↑↓ move · PgUp/PgDn · Enter fold · / filter · ${panes}q quit${state.right === null ? "" : `   ${LEGEND}`}`
}
