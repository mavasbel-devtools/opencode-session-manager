import { describe, expect, it } from "bun:test"
import { createBrowser, reduce, rowsOf, type BrowserState } from "@session-manager/domain/model/Browser"
import { detailLines, fit, footerText, LEGEND, paneTitle, rowText, stamp } from "@session-manager/infrastructure/adapters/inbound/manager-tui/format"
import { commandFor, type KeyInput } from "@session-manager/infrastructure/adapters/inbound/manager-tui/keys"
import { opened, session } from "@test/support/sessions/catalogs"

const T = Date.UTC(2026, 9, 8, 9, 30)

describe("browser text", () => {
  it("fits text to a width, cutting with an ellipsis or padding", () => {
    expect(fit("abc", 5)).toBe("abc  ")
    expect(fit("abcdef", 4)).toBe("abc…")
    expect(fit("§§§", 3)).toBe("§§§")
    expect(fit("abc", 0)).toBe("")
    expect(stamp(T)).toBe("2026-10-08 09:30")
  })

  it("paints folders and sessions at exactly the pane width", () => {
    const withContext = session({ id: "ses_a", directory: "/w", updated: T, title: "A long title that will be cut", context: { compartments: 12, tags: 3456 } })
    const bare = session({ id: "ses_b", directory: "/w", updated: T, title: null })
    expect(rowText({ kind: "group", directory: "/w", sessions: 2, collapsed: false }, 12)).toBe("▾ /w (2)    ")
    expect(rowText({ kind: "group", directory: "/w", sessions: 2, collapsed: true }, 8)).toBe("▸ /w (2)")
    const line = rowText({ kind: "session", session: withContext, match: "newer-here" }, 70)
    expect([...line].length).toBe(70)
    expect(line).toBe("  > A long title that will be cut   2026-10-08 09:30     3m S12 T 3456")
    expect(rowText({ kind: "session", session: withContext, match: "newer-here" }, 60)).toBe("  > A long title that wi… 2026-10-08 09:30     3m S12 T 3456")
    expect(rowText({ kind: "session", session: bare, match: null }, 60)).toBe(fit("    (untitled)", 29) + " 2026-10-08 09:30     3m       ")
    expect(rowText({ kind: "session", session: bare, match: "only-here" }, 20)).toBe(fit("  + (untitled)", 20))
  })

  it("titles a pane with its counts, Magic Context format and where it was read from", () => {
    const pane = createBrowser(opened("left", [session({ id: "s", directory: "/w", updated: 1 })]), null, 3).left
    expect(paneTitle(pane)).toBe(" left · 1 sessions · Magic Context format 94 · /data/left ")
    const snap = createBrowser(opened("right", [], { snapshot: "/tmp/s", context: false }), null, 3).left
    expect(paneTitle(snap)).toBe(" right (snapshot) · 0 sessions · no Magic Context · /data/right ")
    const unknown = { ...pane, catalog: { ...pane.catalog, magicContext: { available: true, schemaVersion: null } } }
    expect(paneTitle(unknown)).toContain("Magic Context format ?")
  })

  it("details a folder, a session with and without Magic Context, and nothing", () => {
    expect(detailLines(undefined)).toEqual(["No sessions."])
    expect(detailLines({ kind: "group", directory: "/w", sessions: 3, collapsed: true })).toEqual(["Folder /w", "3 sessions (collapsed)"])
    expect(detailLines({ kind: "group", directory: "/w", sessions: 3, collapsed: false })[1]).toBe("3 sessions")
    const full = session({ id: "ses_x", directory: "/w", updated: T, parent: "ses_p", fork: "ses_f", archived: T, context: { lastTag: null, project: null } })
    expect(detailLines({ kind: "session", session: full, match: "same" })).toEqual([
      "title ses_x",
      "ses_x · v2 · project proj · sub-agent of ses_p · fork of ses_f · archived 2026-10-08 09:30",
      "/w",
      "created 1970-01-01 00:00 · updated 2026-10-08 09:30 · 3 messages",
      "Magic Context: 1 summaries · 2 tags (last §-) · 0 notes · 0 memories created · no project",
    ])
    const plain = detailLines({ kind: "session", session: session({ id: "ses_y", directory: "/w", updated: T, title: null, context: { project: "git:abc" } }), match: null })
    expect(plain[0]).toBe("(untitled)")
    expect(plain[1]).toBe("ses_y · v2 · project proj")
    expect(plain[4]).toEndWith("(last §2) · 0 notes · 0 memories created · git:abc")
    expect(detailLines({ kind: "session", session: session({ id: "ses_z", directory: "/w", updated: T }), match: null })[4]).toBe(
      "Magic Context: nothing stored for this session",
    )
  })

  it("explains the keys in the footer, the filter while it is typed or kept, and the marks with two panes", () => {
    const one = createBrowser(opened("left", []), null, 3)
    const two = createBrowser(opened("left", []), opened("right", []), 3)
    expect(footerText(one)).toBe("↑↓ move · PgUp/PgDn · Enter fold · / filter · q quit")
    expect(footerText(two)).toBe(`↑↓ move · PgUp/PgDn · Enter fold · / filter · Tab/←→ pane · q quit   ${LEGEND}`)
    const typing = reduce(reduce(one, { type: "filter-start" }), { type: "filter-input", text: "ab" })
    expect(footerText(typing)).toBe("filter: ab▏  Enter keep · Esc clear")
    expect(footerText(reduce(typing, { type: "filter-commit" }))).toStartWith('filter "ab" · ↑↓ move')
  })
})

describe("browser keys", () => {
  const key = (name: string, extra: Partial<KeyInput> = {}): KeyInput => ({ name, ctrl: false, shift: false, sequence: name.length === 1 ? name : "", ...extra })
  const browsing = createBrowser(opened("left", []), null, 3)
  const typing: BrowserState = { ...browsing, editingFilter: true }

  it("browses with arrows, vi keys, paging, folding, panes, the filter and quit", () => {
    expect(commandFor(key("down"), browsing)).toEqual({ type: "move", delta: 1 })
    expect(commandFor(key("k"), browsing)).toEqual({ type: "move", delta: -1 })
    expect(commandFor(key("pagedown"), browsing)).toEqual({ type: "page", direction: 1 })
    expect(commandFor(key("g"), browsing)).toEqual({ type: "home" })
    expect(commandFor(key("g", { shift: true }), browsing)).toEqual({ type: "end" })
    expect(commandFor(key("return"), browsing)).toEqual({ type: "toggle" })
    expect(commandFor(key("tab"), browsing)).toEqual({ type: "focus" })
    expect(commandFor(key("l"), browsing)).toEqual({ type: "focus", side: "right" })
    expect(commandFor(key("/"), browsing)).toEqual({ type: "filter-start" })
    expect(commandFor(key("escape"), browsing)).toEqual({ type: "filter-clear" })
    expect(commandFor(key("q"), browsing)).toEqual({ type: "quit" })
    expect(commandFor(key("c", { ctrl: true }), browsing)).toEqual({ type: "quit" })
    expect(commandFor(key("x"), browsing)).toBeNull()
    expect(commandFor(key("toString"), browsing)).toBeNull()
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

describe("browser rows used by the view", () => {
  it("lists nothing for an empty profile", () => {
    expect(rowsOf(createBrowser(opened("left", []), null, 3), "left")).toEqual([])
  })
})
