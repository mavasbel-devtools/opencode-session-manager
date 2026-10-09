import { describe, expect, it } from "bun:test"
import { createBrowser, reduce, type BrowserAction, type BrowserState, type QueueEntry } from "@session-manager/domain/model/Browser"
import {
  detailLines,
  detailTitle,
  fit,
  footerText,
  LEGEND,
  PAIR_LEGEND,
  pairedTitle,
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
    const entry: QueueEntry = { id: "ses_a", title: "A", direction: "to-right", source: stats, conflict: true, resolution: null }
    expect(queueTitle({ ...both, queue: [entry] })).toBe(" Queue · 1 Magic Context copy · 1 conflicts (1 undecided) ")
    expect(queueTitle(both)).toBe(" Queue · 0 Magic Context copies · 0 conflicts (0 undecided) ")
  })

  it("paints a queue entry with its direction, counts and resolution", () => {
    const entry: QueueEntry = { id: "ses_a", title: "Alpha", direction: "to-right", source: stats, conflict: true, resolution: null }
    expect(queueText(entry, 70)).toBe(`${fit("→ Alpha", 29)} S12 T 3456 N 2 M  7  conflict: undecided`)
    expect(queueText({ ...entry, direction: "to-left", title: null, conflict: false, resolution: "replace" }, 70)).toContain("← (untitled)")
    expect(queueText({ ...entry, conflict: false, resolution: "replace" }, 70)).toEndWith("new on target      ")
    expect(queueText({ ...entry, resolution: "skip" }, 70)).toEndWith("conflict: skip     ")
    expect(queueText(entry, 20)).toBe(fit("→ Alpha", 20))
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
    ])
    const onlyRight = detailLines(one, { kind: "pair", id: "ses_p", left: null, right: { ...right, title: null }, match: "right-only", marked: false })
    expect([onlyRight[0], onlyRight[1], onlyRight[2]]).toEqual(["(untitled)", "ses_p · only on the right", "left : —"])
    for (const [match, text] of [["left-only", "only on the left"], ["same", "same on both sides"], ["left-newer", "newer on the left"]] as const)
      expect(detailLines(one, { kind: "pair", id: "ses_p", left, right, match, marked: false })[1]).toBe(`ses_p · ${text}`)

    const queued = (entry: Partial<QueueEntry>): BrowserState => ({
      ...one,
      view: "queue",
      queue: [{ id: "ses_q", title: "Q", direction: "to-right", source: stats, conflict: true, resolution: null, ...entry }],
    })
    expect(detailLines({ ...one, view: "queue" }, undefined)).toEqual(["The queue is empty: mark sessions (Space) and queue copies with > or <."])
    expect(detailLines({ ...one, view: "queue", lastResult: ["Applied: 1", "two"] }, undefined)).toEqual(["Applied: 1", "two"])
    expect(detailLines({ ...queued({}), lastResult: ["Dry run"] }, undefined)[0]).toBe("Q")
    expect(detailLines(queued({}), undefined)).toEqual([
      "Q",
      "ses_q · copy Magic Context state from the left to the right",
      "12 summaries · 3456 tags · 2 notes · 7 memories created · git:abc",
      "The right has its own state for this session: undecided (r replace · s skip)",
    ])
    expect(detailLines(queued({ resolution: "replace" }), undefined)[3]).toContain(": replace it (")
    expect(detailLines(queued({ resolution: "skip" }), undefined)[3]).toContain(": skip this copy (")
    const toLeft = detailLines(queued({ direction: "to-left", title: null, conflict: false, resolution: "replace", source: { ...stats, project: null } }), undefined)
    expect(toLeft).toEqual([
      "(untitled)",
      "ses_q · copy Magic Context state from the right to the left",
      "12 summaries · 3456 tags · 2 notes · 7 memories created · no project",
      "The left has no state for this session yet.",
    ])
  })

  it("explains the keys in the footer for each view, with the notice and the filter", () => {
    const one = createBrowser(opened("left", []), null, 3)
    const two = createBrowser(opened("left", []), opened("right", []), 3)
    expect(footerText(one)).toBe("↑↓ move · PgUp/PgDn · Enter fold · Space mark · / filter · q quit")
    expect(footerText(two)).toBe("↑↓ · Enter fold · Space/* mark · >/< queue copy · Q queue · Tab pane · p pair · / filter · q quit")
    expect(footerText(run(two, { type: "layout" }))).toContain("· p panes ·")
    expect(footerText(run(two, { type: "view" }))).toBe("a apply · d dry run · r/s replace/skip · R/S all · x remove · c clear · Esc back · q quit")
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
    expect(commandFor(key("r"), queue)).toEqual({ type: "resolve", resolution: "replace" })
    expect(commandFor(key("s"), queue)).toEqual({ type: "resolve", resolution: "skip" })
    expect(commandFor(key("r", { shift: true, sequence: "R" }), queue)).toEqual({ type: "resolve", resolution: "replace", all: true })
    expect(commandFor(key("s", { shift: true, sequence: "S" }), queue)).toEqual({ type: "resolve", resolution: "skip", all: true })
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
