import { describe, expect, it } from "bun:test"
import { createBrowser, reduce, rowsOf, selectedRow, type BrowserAction, type BrowserState, type QueueEntry } from "@session-manager/domain/model/Browser"
import { healthBySession, worse, type Finding, type VerifiedSession, type VerifyReport } from "@session-manager/domain/model/Verify"
import {
  detailLines,
  detailTitle,
  fit,
  footerText,
  LEGEND,
  PAIR_LEGEND,
  healthLine,
  HEALTH_MARKS,
  pairedTitle,
  plannedText,
  rowSeverity,
  paneTitle,
  queueText,
  queueTitle,
  rowText,
  stamp,
} from "@session-manager/infrastructure/adapters/inbound/manager-tui/format"
import { commandFor, type KeyInput } from "@session-manager/infrastructure/adapters/inbound/manager-tui/keys"
import { opened, session } from "@test/support/sessions/catalogs"

const T = Date.UTC(2026, 9, 8, 9, 30)
const run = (state: BrowserState, ...actions: BrowserAction[]) => actions.reduce(reduce, state)
const stats = { compartments: 12, tags: 3456, lastTag: 3456, notes: 2, memoriesOriginated: 7, project: "git:abc" }

describe("browser text", () => {
  it("fits text to a width, cutting with an ellipsis or padding", () => {
    expect(fit("abc", 5)).toBe("abc  ")
    expect(fit("abcdef", 4)).toBe("abc…")
    expect(fit("§§§", 3)).toBe("§§§")
    expect(fit("abc", 0)).toBe("")
    expect(stamp(T)).toBe("2026-10-08 09:30")
  })

  it("paints folders, sessions and pairs at exactly the list width, with marks", () => {
    const withContext = session({ id: "ses_a", directory: "/w", updated: T, title: "A long title that will be cut", context: { compartments: 12, tags: 3456 } })
    const bare = session({ id: "ses_b", directory: "/w", updated: T, title: null })
    expect(rowText({ kind: "group", directory: "/w", sessions: 2, collapsed: false, marked: 0 }, 12)).toBe("▾ /w (2)    ")
    expect(rowText({ kind: "group", directory: "/w", sessions: 2, collapsed: true, marked: 1 }, 12)).toBe("▸ /w (2) ●1 ")
    expect(rowText({ kind: "session", session: withContext, match: "newer-here", marked: false }, 70)).toBe(
      "  > A long title that will be cut   2026-10-08 09:30     3m S12 T 3456",
    )
    expect(rowText({ kind: "session", session: withContext, match: "newer-here", marked: true }, 60)).toBe(
      "● > A long title that wi… 2026-10-08 09:30     3m S12 T 3456",
    )
    expect(rowText({ kind: "session", session: bare, match: null, marked: false }, 60)).toBe(fit("    (untitled)", 25) + " 2026-10-08 09:30     3m           ")
    expect(rowText({ kind: "session", session: bare, match: "only-here", marked: false }, 20)).toBe(fit("  + (untitled)", 20))
    const pair = { kind: "pair" as const, id: "ses_a", left: withContext, right: null, match: "left-only" as const, marked: true }
    const line = rowText(pair, 80)
    expect([...line].length).toBe(80)
    expect(line).toBe(`${fit("● L A long title that will be cut", 18)} 10-08 09:30     3m S12 T 3456 │ ${fit("—", 29)}`)
    expect(rowText({ ...pair, left: null, right: bare, match: "right-only", marked: false }, 20)).toBe(fit("  R (untitled)", 20))
  })

  it("titles a pane, the paired list, the queue and the details", () => {
    const pane = createBrowser(opened("left", [session({ id: "s", directory: "/w", updated: 1 })]), null, 3).left
    expect(paneTitle(pane)).toBe(" left · 1 sessions · Magic Context format 94 · /data/left ")
    const snap = createBrowser(opened("right", [], { snapshot: "/tmp/s", context: false }), null, 3).left
    expect(paneTitle(snap)).toBe(" right (snapshot) · 0 sessions · no Magic Context · /data/right ")
    const unknown = { ...pane, catalog: { ...pane.catalog, magicContext: { available: true, schemaVersion: null } } }
    expect(paneTitle(unknown)).toContain("Magic Context format ?")
    const both = createBrowser(opened("left", []), opened("right", []), 3)
    expect(pairedTitle(both)).toBe(" paired by session id · left /data/left │ right /data/right ")
    expect(detailTitle(both)).toBe(` Details · ${LEGEND} `)
    expect(detailTitle(run(both, { type: "layout" }))).toBe(` Details · ${PAIR_LEGEND} `)
    expect(detailTitle(run(both, { type: "view" }))).toBe(" Details ")
    expect(detailTitle(createBrowser(opened("left", []), null, 3))).toBe(" Details ")
    const source = session({ id: "ses_a", directory: "/w", updated: T, context: stats })
    const entry: QueueEntry = { id: "ses_a", title: "A", direction: "to-right", source, target: null, prefer: "further", planned: null }
    expect(queueTitle({ ...both, queue: [entry] })).toBe(" Queue · 1 session sync · 1 new on the target · Magic Context: sessions and their projects ")
    const diverged = { ...entry, target: source, planned: { action: "skip" as const, relation: "diverged" as const, reason: "diverged" as const, context: null } }
    expect(queueTitle({ ...both, queue: [diverged, diverged], scope: "sessions" })).toBe(" Queue · 2 session syncs · 0 new on the target · 2 diverged · Magic Context: sessions only ")
  })

  it("paints a queue entry with its direction, size, preference and what the sync does", () => {
    const source = session({ id: "ses_a", directory: "/w", updated: T, context: stats })
    const entry: QueueEntry = { id: "ses_a", title: "Alpha", direction: "to-right", source, target: null, prefer: "further", planned: null }
    expect(queueText(entry, 80)).toBe(`${fit("→ Alpha", 28)}     3m S12 T 3456  further ${fit("new: copy", 24)}`)
    expect(queueText({ ...entry, direction: "to-left", title: null }, 80)).toContain("← (untitled)")
    expect(queueText(entry, 20)).toBe(fit("→ Alpha", 20))
    const plan = (action: "copy" | "replace" | "keep" | "skip", reason: "diverged" | "hidden-run" | null = null, context: string | null = null): QueueEntry => ({
      ...entry,
      target: source,
      planned: { action, relation: null, reason, context },
    })
    expect([
      plannedText({ ...entry, target: source }),
      plannedText(plan("copy")),
      plannedText(plan("replace")),
      plannedText(plan("keep", null, "Magic Context copied")),
      plannedText(plan("keep", null, "Magic Context kept (target further)")),
      plannedText(plan("skip", "diverged")),
      plannedText(plan("skip", "hidden-run")),
    ]).toEqual(["both: d to check", "copy", "replace (target behind)", "same: context only", "same: nothing", "diverged: skipped", "skipped (hidden-run)"])
  })

  it("details a folder, a session, a pair, a queue entry and nothing", () => {
    const one = createBrowser(opened("left", []), null, 3)
    expect(detailLines(one, undefined)).toEqual(["No sessions."])
    expect(detailLines(one, { kind: "group", directory: "/w", sessions: 3, collapsed: true, marked: 2 })).toEqual(["Folder /w", "3 sessions (collapsed) · 2 marked"])
    expect(detailLines(one, { kind: "group", directory: "/w", sessions: 3, collapsed: false, marked: 0 })[1]).toBe("3 sessions")
    const full = session({ id: "ses_x", directory: "/w", updated: T, parent: "ses_p", fork: "ses_f", archived: T, context: { lastTag: null, project: null } })
    expect(detailLines(one, { kind: "session", session: full, match: "same", marked: false })).toEqual([
      "title ses_x",
      "ses_x · v2 · project proj · sub-agent of ses_p · fork of ses_f · archived 2026-10-08 09:30",
      "/w",
      "created 1970-01-01 00:00 · updated 2026-10-08 09:30 · 3 messages",
      "Magic Context: 1 summaries · 2 tags (last §-) · 0 notes · 0 memories created · no project",
      "Health: not checked",
    ])
    const plain = detailLines(one, { kind: "session", session: session({ id: "ses_y", directory: "/w", updated: T, title: null, context: { project: "git:abc" } }), match: null, marked: false })
    expect([plain[0], plain[1]]).toEqual(["(untitled)", "ses_y · v2 · project proj"])
    expect(plain[4]).toEndWith("(last §2) · 0 notes · 0 memories created · git:abc")
    expect(detailLines(one, { kind: "session", session: session({ id: "ses_z", directory: "/w", updated: T }), match: null, marked: false })[4]).toBe(
      "Magic Context: nothing stored for this session",
    )
    const left = session({ id: "ses_p", directory: "/w", updated: T, title: "Pair", context: {} })
    const right = session({ id: "ses_p", directory: "C:/w", updated: T, title: "Other" })
    expect(detailLines(one, { kind: "pair", id: "ses_p", left, right, match: "right-newer", marked: false })).toEqual([
      "Pair",
      "ses_p · newer on the right",
      "left : /w · updated 2026-10-08 09:30 · 3 messages · 1 summaries, 2 tags",
      "right: C:/w · updated 2026-10-08 09:30 · 3 messages · no Magic Context",
      "left  Health: not checked",
      "right Health: not checked",
    ])
    const onlyRight = detailLines(one, { kind: "pair", id: "ses_p", left: null, right: { ...right, title: null }, match: "right-only", marked: false })
    expect([onlyRight[0], onlyRight[1], onlyRight[2]]).toEqual(["(untitled)", "ses_p · only on the right", "left : —"])
    for (const [match, text] of [["left-only", "only on the left"], ["same", "same on both sides"], ["left-newer", "newer on the left"]] as const)
      expect(detailLines(one, { kind: "pair", id: "ses_p", left, right, match, marked: false })[1]).toBe(`ses_p · ${text}`)

    const source = session({ id: "ses_q", directory: "/w", updated: T, title: "Q", context: stats })
    const queued = (entry: Partial<QueueEntry>): BrowserState => ({
      ...one,
      view: "queue",
      queue: [{ id: "ses_q", title: "Q", direction: "to-right", source, target: null, prefer: "further", planned: null, ...entry }],
    })
    expect(detailLines({ ...one, view: "queue" }, undefined)).toEqual(["The queue is empty: mark sessions (Space) and queue syncs with > or <."])
    expect(detailLines({ ...one, view: "queue", lastResult: ["Applied: 1", "two"] }, undefined)).toEqual(["Applied: 1", "two"])
    expect(detailLines({ ...queued({}), lastResult: ["Dry run"] }, undefined)[0]).toBe("Q")
    expect(detailLines(queued({}), undefined)).toEqual([
      "Q",
      "ses_q · sync the session and its Magic Context state from the left to the right",
      "left: 3 messages · 12 summaries, 3456 tags · updated 2026-10-08 09:30",
      "right: —",
      "Not checked yet (d). Same history on both sides → Magic Context state from the side whose summaries reach further (r changes)",
    ])
    const toLeft = detailLines(
      queued({ direction: "to-left", title: null, target: session({ id: "ses_q", directory: "/w", updated: T }), prefer: "keep", planned: { action: "keep", relation: "same", reason: null, context: "Magic Context copied" } }),
      undefined,
    )
    expect(toLeft).toEqual([
      "(untitled)",
      "ses_q · sync the session and its Magic Context state from the right to the left",
      "right: 3 messages · 12 summaries, 3456 tags · updated 2026-10-08 09:30",
      "left: 3 messages · no Magic Context · updated 2026-10-08 09:30",
      "same: context only · histories: same · Magic Context copied",
    ])
    expect(detailLines(queued({ prefer: "replace" }), undefined)[4]).toContain("from the source's (r changes)")
    expect(detailLines(queued({ planned: { action: "copy", relation: null, reason: null, context: null } }), undefined)[4]).toBe("copy")
  })

  it("explains the keys in the footer for each view, with the notice and the filter", () => {
    const one = createBrowser(opened("left", []), null, 3)
    const two = createBrowser(opened("left", []), opened("right", []), 3)
    expect(footerText(one)).toBe("↑↓ move · PgUp/PgDn · Enter fold · Space mark · / filter · q quit")
    expect(footerText(two)).toBe("↑↓ · Enter fold · Space/* mark · >/< queue sync · Q queue · Tab pane · p pair · / filter · q quit")
    expect(footerText(run(two, { type: "layout" }))).toContain("· p panes ·")
    expect(footerText(run(two, { type: "view" }))).toBe("d dry run · a apply · r/R Magic Context preference (one/all) · t scope · x remove · c clear · Esc back · q quit")
    expect(footerText({ ...two, notice: "Done." })).toStartWith("Done.   ↑↓ ·")
    const typing = run(one, { type: "filter-start" }, { type: "filter-input", text: "ab" })
    expect(footerText(typing)).toBe("filter: ab▏  Enter keep · Esc clear")
    expect(footerText(run(typing, { type: "filter-commit" }))).toStartWith('filter "ab" · ↑↓ move')
  })
})

describe("browser keys", () => {
  const key = (name: string, extra: Partial<KeyInput> = {}): KeyInput => ({ name, ctrl: false, shift: false, sequence: name.length === 1 ? name : "", ...extra })
  const browsing = createBrowser(opened("left", []), null, 3)
  const typing: BrowserState = { ...browsing, editingFilter: true }
  const queue: BrowserState = { ...browsing, view: "queue" }

  it("browses with arrows, vi keys, paging, folding, marks, the queue, panes, the filter and quit", () => {
    expect(commandFor(key("down"), browsing)).toEqual({ type: "move", delta: 1 })
    expect(commandFor(key("k"), browsing)).toEqual({ type: "move", delta: -1 })
    expect(commandFor(key("pagedown"), browsing)).toEqual({ type: "page", direction: 1 })
    expect(commandFor(key("g"), browsing)).toEqual({ type: "home" })
    expect(commandFor(key("g", { shift: true, sequence: "G" }), browsing)).toEqual({ type: "end" })
    expect(commandFor(key("g", { shift: true, sequence: "" }), browsing)).toEqual({ type: "end" })
    expect(commandFor(key("return"), browsing)).toEqual({ type: "toggle" })
    expect(commandFor(key("space", { sequence: " " }), browsing)).toEqual({ type: "mark" })
    expect(commandFor(key("8", { shift: true, sequence: "*" }), browsing)).toEqual({ type: "mark-all" })
    expect(commandFor(key(".", { shift: true, sequence: ">" }), browsing)).toEqual({ type: "enqueue", direction: "to-right" })
    expect(commandFor(key(",", { shift: true, sequence: "<" }), browsing)).toEqual({ type: "enqueue", direction: "to-left" })
    expect(commandFor(key("q", { shift: true, sequence: "Q" }), browsing)).toEqual({ type: "view", view: "queue" })
    expect(commandFor(key("p"), browsing)).toEqual({ type: "layout" })
    expect(commandFor(key("tab"), browsing)).toEqual({ type: "focus" })
    expect(commandFor(key("l"), browsing)).toEqual({ type: "focus", side: "right" })
    expect(commandFor(key("/"), browsing)).toEqual({ type: "filter-start" })
    expect(commandFor(key("escape"), browsing)).toEqual({ type: "filter-clear" })
    expect(commandFor(key("q"), browsing)).toEqual({ type: "quit" })
    expect(commandFor(key("c", { ctrl: true }), browsing)).toEqual({ type: "quit" })
    expect(commandFor(key("x"), browsing)).toBeNull()
    expect(commandFor(key("toString"), browsing)).toBeNull()
    expect(commandFor(key("x", { shift: true, sequence: "X" }), browsing)).toBeNull()
  })

  it("edits the queue in the queue view", () => {
    expect(commandFor(key("j"), queue)).toEqual({ type: "queue-move", delta: 1 })
    expect(commandFor(key("up"), queue)).toEqual({ type: "queue-move", delta: -1 })
    expect(commandFor(key("r"), queue)).toEqual({ type: "prefer" })
    expect(commandFor(key("r", { shift: true, sequence: "R" }), queue)).toEqual({ type: "prefer", all: true })
    expect(commandFor(key("t"), queue)).toEqual({ type: "scope" })
    expect(commandFor(key("s"), queue)).toBeNull()
    expect(commandFor(key("x"), queue)).toEqual({ type: "unqueue" })
    expect(commandFor(key("delete"), queue)).toEqual({ type: "unqueue" })
    expect(commandFor(key("c"), queue)).toEqual({ type: "queue-clear" })
    expect(commandFor(key("a"), queue)).toEqual({ type: "apply", dryRun: false })
    expect(commandFor(key("d"), queue)).toEqual({ type: "apply", dryRun: true })
    expect(commandFor(key("escape"), queue)).toEqual({ type: "view", view: "list" })
    expect(commandFor(key("q", { shift: true, sequence: "Q" }), queue)).toEqual({ type: "view", view: "list" })
    expect(commandFor(key("q"), queue)).toEqual({ type: "quit" })
    expect(commandFor(key("p"), queue)).toBeNull()
  })

  it("edits the filter while it is typed", () => {
    expect(commandFor(key("q"), typing)).toEqual({ type: "filter-input", text: "q" })
    expect(commandFor(key("space", { sequence: " " }), typing)).toEqual({ type: "filter-input", text: " " })
    expect(commandFor(key("return"), typing)).toEqual({ type: "filter-commit" })
    expect(commandFor(key("enter"), typing)).toEqual({ type: "filter-commit" })
    expect(commandFor(key("escape"), typing)).toEqual({ type: "filter-clear" })
    expect(commandFor(key("backspace"), typing)).toEqual({ type: "filter-backspace" })
    expect(commandFor(key("up"), typing)).toBeNull()
    expect(commandFor(key("a", { ctrl: true, sequence: "a" }), typing)).toBeNull()
    expect(commandFor(key("c", { ctrl: true }), typing)).toEqual({ type: "quit" })
    expect(commandFor(key("x", { sequence: "\u0001" }), typing)).toBeNull()
  })
})

describe("session health in the browser", () => {
  const verified = (id: string, extra: Partial<VerifiedSession> = {}): VerifiedSession => ({
    id,
    title: id,
    directory: "/w",
    messages: 40,
    summaries: 3,
    unsummarized: 12,
    last_context_percentage: 42.25,
    wrapup: "none",
    ...extra,
  })
  const found = (kind: Finding["kind"], id: string, severity: Finding["severity"]): Finding => ({ kind, session_id: id, severity, detail: `${kind} detail` })
  const report = (sessions: VerifiedSession[], findings: Finding[]): VerifyReport => ({
    opencode_db: "/o",
    context_db: "/c",
    magic_context_format: 95,
    checks: { opencode: { integrity_ok: true, foreign_keys_ok: true }, context: { integrity_ok: true, foreign_keys_ok: true } },
    sessions_checked: sessions.length,
    sessions,
    findings,
    counts: { error: 0, warning: 0, info: 0 },
    ok: true,
  })

  it("files a verify report by session, keeping each one's most serious finding", () => {
    const health = healthBySession(
      report(
        [verified("a"), verified("b"), verified("c")],
        [found("summaries-behind", "a", "warning"), found("over-limit", "a", "error"), found("near-limit", "a", "warning"), found("wrapup-running", "b", "info"), found("store-integrity", null as unknown as string, "error"), found("session-not-found", "zz", "warning")],
      ),
    )
    expect(Object.keys(health)).toEqual(["a", "b", "c"])
    expect([health["a"]!.worst, health["a"]!.findings.length, health["b"]!.worst, health["c"]!.worst]).toEqual(["error", 3, "info", null])
    expect([worse(null, null), worse("info", null), worse(null, "warning"), worse("error", "warning"), worse("warning", "error")]).toEqual([null, "info", "warning", "error", "error"])
  })

  it("marks a list row by its most serious finding, on both sides in the paired list", () => {
    const left = opened("left", [session({ id: "ses_a", directory: "/w", updated: T, title: "A" }), session({ id: "ses_b", directory: "/w", updated: T, title: "B" })])
    const right = opened("right", [session({ id: "ses_a", directory: "/w", updated: T, title: "A" })])
    const leftHealth = healthBySession(report([verified("ses_a"), verified("ses_b")], [found("summaries-behind", "ses_a", "warning")]))
    const rightHealth = healthBySession(report([verified("ses_a")], [found("over-limit", "ses_a", "error")]))
    const state = createBrowser({ ...left, health: leftHealth }, { ...right, health: rightHealth }, 10)
    const rows = (list: "left" | "right" | "paired") => {
      const shown = list === "paired" ? run(state, { type: "layout" }) : state
      return rowsOf(shown, list).map((row) => rowSeverity(shown, list, row))
    }
    expect(rows("left")).toEqual([null, "warning", null])
    expect(rows("right")).toEqual([null, "error"])
    expect(rows("paired")).toEqual([null, "error", null])
    const sessionRow = rowsOf(state, "left")[1]!
    expect(rowText(sessionRow, 60, "warning")).toStartWith(` ${HEALTH_MARKS.warning}= A`)
    expect(rowText(sessionRow, 60, null)).toStartWith("  = A")
    expect(rowText(rowsOf(run(state, { type: "layout" }), "paired")[1]!, 90, "error")).toStartWith(" != A")
    expect(paneTitle(state.left)).toContain("· health 0! 1~ ·")
    expect(paneTitle(state.right!)).toContain("· health 1! 0~ ·")
  })

  it("says how far a session's summaries reach, how large its last prompt was, and what was found", () => {
    expect(healthLine(undefined)).toBe("Health: not checked")
    expect(healthLine(null)).toBe("Health: nothing known")
    expect(healthLine({ session: null, findings: [], worst: null })).toBe("Health: nothing known")
    expect(healthLine({ session: verified("a"), findings: [], worst: null })).toBe(
      "Health: 12 of 40 messages after the newest of 3 summaries · last prompt 42.3 % of the window · ok",
    )
    expect(
      healthLine({
        session: verified("a", { summaries: 0, unsummarized: 40, last_context_percentage: null, wrapup: "running" }),
        findings: [found("summaries-behind", "a", "warning"), found("wrapup-running", "a", "info"), found("over-limit", "a", "error")],
        worst: "error",
      }),
    ).toBe("Health: no summaries for its 40 messages · wrapup running · ~ summaries-behind, i wrapup-running, ! over-limit")
    expect(healthLine({ session: verified("a", { unsummarized: null, wrapup: "left-behind" }), findings: [], worst: null })).toBe(
      "Health: 3 summaries, ending past its history · last prompt 42.3 % of the window · wrapup interrupted · ok",
    )
    expect(healthLine({ session: verified("a", { wrapup: null }), findings: [], worst: null })).toEndWith("window · ok")
    expect(healthLine({ session: verified("a", { summaries: 0, unsummarized: null, last_context_percentage: null, wrapup: null }), findings: [], worst: null })).toBe(
      "Health: no Magic Context state for its 40 messages · ok",
    )
  })

  it("details a session's health and its most serious finding, and each side's in the paired list", () => {
    const left = opened("left", [session({ id: "ses_a", directory: "/w", updated: T, title: "A" })])
    const right = opened("right", [session({ id: "ses_a", directory: "/w", updated: T, title: "A" }), session({ id: "ses_r", directory: "/w", updated: T, title: "R" })])
    const health = healthBySession(report([verified("ses_a")], [found("summaries-behind", "ses_a", "warning"), found("near-limit", "ses_a", "warning")]))
    const state = createBrowser({ ...left, health }, { ...right, health: {} }, 10)
    const lines = detailLines(state, selectedRow(run(state, { type: "move", delta: 1 })))
    expect(lines.slice(-2)).toEqual([
      "Health: 12 of 40 messages after the newest of 3 summaries · last prompt 42.3 % of the window · ~ summaries-behind, ~ near-limit",
      "  summaries-behind: summaries-behind detail",
    ])
    const onRight = run(state, { type: "focus", side: "right" }, { type: "move", delta: 1 })
    expect(detailLines(onRight, selectedRow(onRight)).at(-1)).toBe("Health: nothing known")
    const paired = run(state, { type: "layout" }, { type: "move", delta: 1 })
    expect(detailLines(paired, selectedRow(paired)).slice(-2)).toEqual([
      "left  Health: 12 of 40 messages after the newest of 3 summaries · last prompt 42.3 % of the window · ~ summaries-behind, ~ near-limit",
      "right Health: nothing known",
    ])
  })
})
