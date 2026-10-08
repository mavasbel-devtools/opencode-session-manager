import { describe, expect, it } from "bun:test"
import {
  createBrowser,
  paneOf,
  reduce,
  rowsOf,
  selectedRow,
  type BrowserAction,
  type BrowserState,
} from "@session-manager/domain/model/Browser"
import { opened, session } from "@test/support/sessions/catalogs"

const left = opened("left", [
  session({ id: "ses_a", directory: "/w/one", updated: 50, title: "Alpha" }),
  session({ id: "ses_b", directory: "/w/two", updated: 40, title: null }),
  session({ id: "ses_c", directory: "/w/one", updated: 30, title: "Gamma" }),
  session({ id: "ses_d", directory: "/w/two", updated: 20, title: "Delta" }),
])
const right = opened("right", [
  session({ id: "ses_a", directory: "C:/one", updated: 50 }),
  session({ id: "ses_b", directory: "C:/two", updated: 10 }),
  session({ id: "ses_c", directory: "C:/one", updated: 99 }),
])

const run = (state: BrowserState, ...actions: BrowserAction[]) => actions.reduce(reduce, state)
const labels = (state: BrowserState, side: "left" | "right" = "left") =>
  rowsOf(state, side).map((row) => (row.kind === "group" ? `[${row.directory}${row.collapsed ? "+" : ""}]` : `${row.session.id}${row.match ?? ""}`))

describe("Browser rows", () => {
  it("groups sessions by folder, folders by their newest session, and marks each against the other pane", () => {
    const state = createBrowser(left, right, 10)
    expect(labels(state)).toEqual(["[/w/one]", "ses_asame", "ses_colder-here", "[/w/two]", "ses_bnewer-here", "ses_donly-here"])
    expect(labels(state, "right")).toEqual(["[C:/one]", "ses_cnewer-here", "ses_asame", "[C:/two]", "ses_bolder-here"])
    expect(rowsOf(state, "left")[0]).toEqual({ kind: "group", directory: "/w/one", sessions: 2, collapsed: false })
  })

  it("has no marks with one pane, and no rows for a missing pane", () => {
    const state = createBrowser(left, null, 0)
    expect(state.listHeight).toBe(1)
    expect(labels(state)).toEqual(["[/w/one]", "ses_a", "ses_c", "[/w/two]", "ses_b", "ses_d"])
    expect(rowsOf(state, "right")).toEqual([])
    expect(paneOf(state, "right")).toBeNull()
    expect(selectedRow(state, "right")).toBeUndefined()
  })

  it("filters on id, title and folder, case-insensitively, and an untitled session still matches by id", () => {
    const state = createBrowser(left, right, 10)
    expect(labels(run(state, { type: "filter-input", text: "GAM" }))).toEqual(["[/w/one]", "ses_colder-here"])
    expect(labels(run(state, { type: "filter-input", text: "two" }))).toEqual(["[/w/two]", "ses_bnewer-here", "ses_donly-here"])
    expect(labels(run(state, { type: "filter-input", text: "ses_b" }))).toEqual(["[/w/two]", "ses_bnewer-here"])
  })
})

describe("Browser actions", () => {
  it("moves, pages and jumps within the rows, scrolling the window to the cursor", () => {
    const state = createBrowser(left, null, 2)
    const moved = run(state, { type: "move", delta: 3 })
    expect([moved.left.cursor, moved.left.offset]).toEqual([3, 2])
    expect(selectedRow(moved, "left")).toEqual({ kind: "group", directory: "/w/two", sessions: 2, collapsed: false })
    const back = run(moved, { type: "move", delta: -2 })
    expect([back.left.cursor, back.left.offset]).toEqual([1, 1])
    expect(run(state, { type: "move", delta: -5 }).left.cursor).toBe(0)
    expect(run(state, { type: "page", direction: 1 }).left.cursor).toBe(2)
    expect(run(state, { type: "end" }).left).toMatchObject({ cursor: 5, offset: 4 })
    expect(run(state, { type: "end" }, { type: "page", direction: -1 }).left.cursor).toBe(3)
    expect(run(state, { type: "end" }, { type: "home" }).left).toMatchObject({ cursor: 0, offset: 0 })
  })

  it("folds the folder under the cursor, and from a session folds its folder and selects it", () => {
    const state = createBrowser(left, null, 10)
    const folded = run(state, { type: "toggle" })
    expect(labels(folded)).toEqual(["[/w/one+]", "[/w/two]", "ses_b", "ses_d"])
    expect(labels(run(folded, { type: "toggle" }))).toEqual(["[/w/one]", "ses_a", "ses_c", "[/w/two]", "ses_b", "ses_d"])
    const fromSession = run(state, { type: "move", delta: 5 }, { type: "toggle" })
    expect(labels(fromSession)).toEqual(["[/w/one]", "ses_a", "ses_c", "[/w/two+]"])
    expect(fromSession.left.cursor).toBe(3)
    const empty = createBrowser(opened("empty", []), null, 5)
    expect(run(empty, { type: "toggle" })).toBe(empty)
  })

  it("switches panes only to one that is open", () => {
    const two = createBrowser(left, right, 10)
    expect(run(two, { type: "focus" }).focus).toBe("right")
    expect(run(two, { type: "focus" }, { type: "focus" }).focus).toBe("left")
    expect(run(two, { type: "focus", side: "right" }).focus).toBe("right")
    const one = createBrowser(left, null, 10)
    expect(run(one, { type: "focus" })).toBe(one)
    expect(run(one, { type: "focus", side: "left" }).focus).toBe("left")
  })

  it("selects a clicked row in either pane and moves the focus there", () => {
    const two = createBrowser(left, right, 2)
    const clicked = run(two, { type: "select", side: "right", index: 1 })
    expect(clicked.focus).toBe("right")
    expect(clicked.right?.cursor).toBe(1)
    const scrolledThenClicked = run(two, { type: "scroll", side: "left", delta: 2 }, { type: "select", side: "left", index: 1 })
    expect(scrolledThenClicked.left.cursor).toBe(3)
    const one = createBrowser(left, null, 2)
    expect(run(one, { type: "select", side: "right", index: 0 })).toBe(one)
    expect(run(one, { type: "scroll", side: "right", delta: 1 })).toBe(one)
  })

  it("scrolls the window with the wheel, dragging the cursor along, within the rows", () => {
    const state = createBrowser(left, null, 2)
    const down = run(state, { type: "scroll", side: "left", delta: 3 })
    expect([down.left.offset, down.left.cursor]).toEqual([3, 3])
    const far = run(state, { type: "scroll", side: "left", delta: 99 })
    expect([far.left.offset, far.left.cursor]).toEqual([4, 4])
    const up = run(state, { type: "end" }, { type: "scroll", side: "left", delta: -3 })
    expect([up.left.offset, up.left.cursor]).toEqual([1, 2])
  })

  it("edits, keeps and clears the filter, sending every cursor back to the top", () => {
    const state = createBrowser(left, right, 10)
    const typing = run(state, { type: "move", delta: 2 }, { type: "filter-start" }, { type: "filter-input", text: "w" }, { type: "filter-input", text: "x" })
    expect(typing).toMatchObject({ editingFilter: true, filter: "wx" })
    expect(typing.left.cursor).toBe(0)
    expect(rowsOf(typing, "left")).toEqual([])
    const fixed = run(typing, { type: "filter-backspace" }, { type: "filter-commit" })
    expect(fixed).toMatchObject({ editingFilter: false, filter: "w" })
    expect(run(fixed, { type: "filter-start" }, { type: "filter-clear" })).toMatchObject({ editingFilter: false, filter: "" })
    expect(run(createBrowser(left, null, 3), { type: "filter-input", text: "a" }).right).toBeNull()
  })

  it("keeps both cursors visible when the terminal resizes", () => {
    const state = run(createBrowser(left, right, 10), { type: "end" }, { type: "focus" }, { type: "end" })
    const small = run(state, { type: "resize", listHeight: 2 })
    expect(small.listHeight).toBe(2)
    expect([small.left.cursor, small.left.offset]).toEqual([5, 4])
    expect([small.right!.cursor, small.right!.offset]).toEqual([4, 3])
    expect(run(createBrowser(left, null, 5), { type: "resize", listHeight: -3 }).listHeight).toBe(1)
  })
})
