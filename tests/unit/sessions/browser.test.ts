import { describe, expect, it } from "bun:test"
import {
  createBrowser,
  paneOf,
  queueSummary,
  queueWindowStart,
  reduce,
  requestsFor,
  rowsOf,
  selectedRow,
  type BrowserAction,
  type BrowserState,
  type ListId,
} from "@session-manager/domain/model/Browser"
import { opened, session } from "@test/support/sessions/catalogs"

const left = opened("left", [
  session({ id: "ses_a", directory: "/w/one", updated: 50, title: "Alpha", context: {} }),
  session({ id: "ses_b", directory: "/w/two", updated: 40, title: null }),
  session({ id: "ses_c", directory: "/w/one", updated: 30, title: "Gamma", context: { compartments: 4 } }),
  session({ id: "ses_d", directory: "/w/two", updated: 20, title: "Delta", context: {} }),
])
const right = opened("right", [
  session({ id: "ses_a", directory: "C:/one", updated: 50, context: {} }),
  session({ id: "ses_b", directory: "C:/two", updated: 10, context: {} }),
  session({ id: "ses_c", directory: "C:/one", updated: 99 }),
  session({ id: "ses_e", directory: "C:/three", updated: 5, title: "Echo", context: {} }),
])

const run = (state: BrowserState, ...actions: BrowserAction[]) => actions.reduce(reduce, state)
const labels = (state: BrowserState, list: ListId = "left") =>
  rowsOf(state, list).map((row) =>
    row.kind === "group"
      ? `[${row.directory}${row.collapsed ? "+" : ""}${row.marked === 0 ? "" : ` ${row.marked}`}]`
      : `${row.kind === "pair" ? row.id : row.session.id}${row.match ?? ""}${row.marked ? "*" : ""}`,
  )
const two = (height = 20) => createBrowser(left, right, height)
const paired = (height = 20) => run(two(height), { type: "layout" })

describe("Browser rows", () => {
  it("groups each pane's sessions by folder, newest folder first, marked against the other pane", () => {
    const state = two()
    expect(labels(state)).toEqual(["[/w/one]", "ses_asame", "ses_colder-here", "[/w/two]", "ses_bnewer-here", "ses_donly-here"])
    expect(labels(state, "right")).toEqual(["[C:/one]", "ses_cnewer-here", "ses_asame", "[C:/two]", "ses_bolder-here", "[C:/three]", "ses_eonly-here"])
    expect(rowsOf(state, "left")[0]).toEqual({ kind: "group", directory: "/w/one", sessions: 2, collapsed: false, marked: 0 })
  })

  it("pairs every session id across both sides, newest first, grouped by the left folder or else the right", () => {
    const state = paired()
    expect(state.layout).toBe("paired")
    expect(labels(state, "paired")).toEqual([
      "[/w/one]",
      "ses_cright-newer",
      "ses_asame",
      "[/w/two]",
      "ses_bleft-newer",
      "ses_dleft-only",
      "[C:/three]",
      "ses_eright-only",
    ])
    const pair = rowsOf(state, "paired")[7]
    expect(pair).toMatchObject({ kind: "pair", id: "ses_e", left: null, right: { title: "Echo" }, marked: false })
  })

  it("has no marks, no paired list and no layout switch with one pane", () => {
    const state = createBrowser(left, null, 0)
    expect(state.listHeight).toBe(1)
    expect(labels(state)).toEqual(["[/w/one]", "ses_a", "ses_c", "[/w/two]", "ses_b", "ses_d"])
    expect(rowsOf(state, "right")).toEqual([])
    expect(rowsOf(state, "paired")).toEqual([])
    expect(paneOf(state, "right")).toBeNull()
    expect(selectedRow(state, "paired")).toBeUndefined()
    const refused = run(state, { type: "layout" })
    expect(refused.layout).toBe("panes")
    expect(refused.notice).toBe("Open a second profile with --right to pair sessions.")
  })

  it("filters on id, title and folder, case-insensitively, and a pair on either side", () => {
    const state = two()
    expect(labels(run(state, { type: "filter-input", text: "GAM" }))).toEqual(["[/w/one]", "ses_colder-here"])
    expect(labels(run(state, { type: "filter-input", text: "ses_b" }))).toEqual(["[/w/two]", "ses_bnewer-here"])
    expect(labels(run(paired(), { type: "filter-input", text: "c:/three" }), "paired")).toEqual(["[C:/three]", "ses_eright-only"])
    expect(labels(run(paired(), { type: "filter-input", text: "gamma" }), "paired")).toEqual(["[/w/one]", "ses_cright-newer"])
  })
})

describe("Browser movement", () => {
  it("moves, pages and jumps within the rows, scrolling the window to the cursor", () => {
    const state = createBrowser(left, null, 2)
    const moved = run(state, { type: "move", delta: 3 })
    expect([moved.left.cursor, moved.left.offset]).toEqual([3, 2])
    expect(selectedRow(moved)).toEqual({ kind: "group", directory: "/w/two", sessions: 2, collapsed: false, marked: 0 })
    const back = run(moved, { type: "move", delta: -2 })
    expect([back.left.cursor, back.left.offset]).toEqual([1, 1])
    expect(run(state, { type: "move", delta: -5 }).left.cursor).toBe(0)
    expect(run(state, { type: "page", direction: 1 }).left.cursor).toBe(2)
    expect(run(state, { type: "end" }).left).toMatchObject({ cursor: 5, offset: 4 })
    expect(run(state, { type: "end" }, { type: "page", direction: -1 }).left.cursor).toBe(3)
    expect(run(state, { type: "end" }, { type: "home" }).left).toMatchObject({ cursor: 0, offset: 0 })
  })

  it("keeps the other pane on the same session when it lists it", () => {
    const onA = run(two(), { type: "move", delta: 1 })
    expect(onA.right!.cursor).toBe(2)
    const onGroup = run(onA, { type: "move", delta: 2 })
    expect(onGroup.right!.cursor).toBe(2)
    const fromRight = run(two(), { type: "select", list: "right", index: 1 })
    expect([fromRight.focus, fromRight.left.cursor]).toEqual(["right", 2])
    const unmatched = run(fromRight, { type: "end" })
    expect([unmatched.right!.cursor, unmatched.left.cursor]).toEqual([6, 2])
  })

  it("switches layout keeping the selected session, and pages the paired list", () => {
    const onC = run(two(), { type: "move", delta: 2 })
    const pairedOnC = run(onC, { type: "layout" })
    expect(selectedRow(pairedOnC)).toMatchObject({ kind: "pair", id: "ses_c" })
    const onE = run(pairedOnC, { type: "end" })
    const panesAgain = run(onE, { type: "layout" })
    expect([panesAgain.layout, panesAgain.left.cursor]).toEqual(["panes", 2])
    const fromGroup = run(two(), { type: "layout" })
    expect(fromGroup.paired.cursor).toBe(0)
    expect(run(paired(3), { type: "page", direction: 1 }).paired).toMatchObject({ cursor: 3, offset: 1 })
  })

  it("folds the folder under the cursor, from a folder, a session or a pair", () => {
    const state = createBrowser(left, null, 10)
    const folded = run(state, { type: "toggle" })
    expect(labels(folded)).toEqual(["[/w/one+]", "[/w/two]", "ses_b", "ses_d"])
    expect(labels(run(folded, { type: "toggle" }))).toEqual(["[/w/one]", "ses_a", "ses_c", "[/w/two]", "ses_b", "ses_d"])
    const fromSession = run(state, { type: "move", delta: 5 }, { type: "toggle" })
    expect([labels(fromSession).at(-1), fromSession.left.cursor]).toEqual(["[/w/two+]", 3])
    const fromPair = run(paired(), { type: "end" }, { type: "toggle" })
    expect(labels(fromPair, "paired").at(-1)).toBe("[C:/three+]")
    const fromLeftPair = run(paired(), { type: "move", delta: 1 }, { type: "toggle" })
    expect(labels(fromLeftPair, "paired")[0]).toBe("[/w/one+]")
    const empty = createBrowser(opened("empty", []), null, 5)
    expect(run(empty, { type: "toggle" })).toEqual(empty)
  })

  it("switches panes only to one that is open", () => {
    expect(run(two(), { type: "focus" }).focus).toBe("right")
    expect(run(two(), { type: "focus" }, { type: "focus" }).focus).toBe("left")
    expect(run(two(), { type: "focus", side: "right" }).focus).toBe("right")
    const one = createBrowser(left, null, 10)
    expect(run(one, { type: "focus" })).toEqual(one)
    expect(run(one, { type: "focus", side: "left" }).focus).toBe("left")
  })

  it("selects a clicked row in any list, and scrolls a list with the wheel, dragging the cursor along", () => {
    const clicked = run(two(2), { type: "select", list: "right", index: 1 })
    expect([clicked.focus, clicked.right?.cursor]).toEqual(["right", 1])
    expect(run(two(2), { type: "scroll", list: "left", delta: 2 }, { type: "select", list: "left", index: 1 }).left.cursor).toBe(3)
    const pairClick = run(paired(2), { type: "select", list: "paired", index: 1 })
    expect([pairClick.focus, pairClick.paired.cursor]).toEqual(["left", 1])
    const one = createBrowser(left, null, 2)
    expect(run(one, { type: "select", list: "right", index: 0 })).toEqual(one)
    expect(run(one, { type: "scroll", list: "paired", delta: 1 })).toEqual(one)
    const down = run(one, { type: "scroll", list: "left", delta: 3 })
    expect([down.left.offset, down.left.cursor]).toEqual([3, 3])
    const far = run(one, { type: "scroll", list: "left", delta: 99 })
    expect([far.left.offset, far.left.cursor]).toEqual([4, 4])
    const up = run(one, { type: "end" }, { type: "scroll", list: "left", delta: -3 })
    expect([up.left.offset, up.left.cursor]).toEqual([1, 2])
  })

  it("edits, keeps and clears the filter, sending every cursor back to the top", () => {
    const typing = run(two(), { type: "move", delta: 2 }, { type: "filter-start" }, { type: "filter-input", text: "w" }, { type: "filter-input", text: "x" })
    expect(typing).toMatchObject({ editingFilter: true, filter: "wx" })
    expect([typing.left.cursor, typing.right!.cursor, typing.paired.cursor]).toEqual([0, 0, 0])
    expect(rowsOf(typing, "left")).toEqual([])
    const fixed = run(typing, { type: "filter-backspace" }, { type: "filter-commit" })
    expect(fixed).toMatchObject({ editingFilter: false, filter: "w" })
    expect(run(fixed, { type: "filter-start" }, { type: "filter-clear" })).toMatchObject({ editingFilter: false, filter: "" })
    expect(run(createBrowser(left, null, 3), { type: "filter-input", text: "a" }).right).toBeNull()
  })

  it("keeps every cursor visible when the terminal resizes", () => {
    const state = run(two(), { type: "end" }, { type: "focus" }, { type: "end" }, { type: "layout" }, { type: "end" }, { type: "layout" })
    const small = run(state, { type: "resize", listHeight: 2 })
    expect(small.listHeight).toBe(2)
    expect([small.left.cursor, small.left.offset]).toEqual([5, 4])
    expect([small.right!.cursor, small.right!.offset]).toEqual([6, 5])
    expect([small.paired.cursor, small.paired.offset]).toEqual([7, 6])
    expect(run(createBrowser(left, null, 5), { type: "resize", listHeight: -3 }).listHeight).toBe(1)
  })
})

describe("Browser marks", () => {
  it("marks a session, a whole folder, and everything the filter shows, each toggling back", () => {
    const one = run(two(), { type: "move", delta: 1 }, { type: "mark" })
    expect(one.marked).toEqual(["ses_a"])
    expect(labels(one)).toContain("ses_asame*")
    expect(labels(one, "right")).toContain("ses_asame*")
    expect(labels(one)[0]).toBe("[/w/one 1]")
    expect(run(one, { type: "mark" }).marked).toEqual([])
    const folder = run(two(), { type: "mark" })
    expect(folder.marked).toEqual(["ses_a", "ses_c"])
    expect(run(folder, { type: "mark" }).marked).toEqual([])
    const partial = run(one, { type: "move", delta: -1 }, { type: "mark" })
    expect(partial.marked).toEqual(["ses_a", "ses_c"])
    const filtered = run(paired(), { type: "filter-input", text: "C:/" }, { type: "mark-all" })
    expect(filtered.marked).toEqual(["ses_c", "ses_a", "ses_b", "ses_e"])
    expect(run(filtered, { type: "mark-all" }).marked).toEqual([])
    const nothing = run(two(), { type: "filter-input", text: "zz" })
    expect(run(nothing, { type: "mark" })).toEqual({ ...nothing, notice: null })
  })
})

describe("Browser rows across OpenCode generations", () => {
  it("pairs a session moved to OpenCode 2 once, by its OpenCode 2 row, and compares the panes by it", () => {
    const v1 = (id: string, updated: number) => ({ ...session({ id, directory: "/old", updated }), generation: "v1" as const })
    const a = opened("left", [v1("ses_m", 1), session({ id: "ses_m", directory: "/w", updated: 5 }), v1("ses_v1", 2)])
    const b = opened("right", [session({ id: "ses_m", directory: "/w", updated: 5 }), v1("ses_m", 9)])
    const state = run(createBrowser(a, b, 20), { type: "layout" })
    expect(labels(state, "paired")).toEqual(["[/w]", "ses_msame", "[/old]", "ses_v1left-only"])
    expect(labels(run(state, { type: "layout" }), "right")).toEqual(["[/old]", "ses_mnewer-here", "[/w]", "ses_msame"])
  })
})

describe("Browser queue", () => {
  it("queues whole-session syncs, the target's copy beside each, and clears the marks", () => {
    const state = run(paired(), { type: "mark-all" }, { type: "enqueue", direction: "to-right" })
    expect(state.marked).toEqual([])
    expect(state.notice).toBe("Queued 4 session syncs →; skipped 1 not on the left. Q shows the queue; d checks it on copies.")
    expect(state.queue.map((entry) => [entry.id, entry.direction, entry.target?.timeUpdated ?? null, entry.prefer, entry.planned])).toEqual([
      ["ses_c", "to-right", 99, "further", null],
      ["ses_a", "to-right", 50, "further", null],
      ["ses_b", "to-right", 10, "further", null],
      ["ses_d", "to-right", null, "further", null],
    ])
    expect(state.queue[0]!.source.magicContext?.compartments).toBe(4)
    expect(queueSummary(state.queue)).toEqual({ entries: 4, new: 1, diverged: 0 })
    const again = run(state, { type: "move", delta: 2 }, { type: "enqueue", direction: "to-left" })
    expect(again.notice).toBe("Queued 1 session sync ←. Q shows the queue; d checks it on copies.")
    expect(again.queue.map((entry) => [entry.id, entry.direction])).toEqual([
      ["ses_c", "to-right"],
      ["ses_b", "to-right"],
      ["ses_d", "to-right"],
      ["ses_a", "to-left"],
    ])
  })

  it("queues a sub-agent session's root once, and takes a session's OpenCode 2 row over its OpenCode 1 row", () => {
    const sub = opened("left", [
      session({ id: "ses_root", directory: "/w", updated: 9 }),
      session({ id: "ses_kid", directory: "/w", updated: 8, parent: "ses_root" }),
      session({ id: "ses_grandkid", directory: "/w", updated: 7, parent: "ses_kid" }),
      session({ id: "ses_x", directory: "/w", updated: 6, parent: "ses_y" }),
      session({ id: "ses_y", directory: "/w", updated: 5, parent: "ses_x" }),
      session({ id: "ses_orphan", directory: "/w", updated: 4, parent: "ses_gone" }),
    ])
    const v1 = { ...session({ id: "ses_root", directory: "/old", updated: 1 }), generation: "v1" as const }
    const target = opened("right", [v1, session({ id: "ses_root", directory: "/w", updated: 3 })])
    const state = run(createBrowser(sub, target, 20), { type: "mark-all" }, { type: "enqueue", direction: "to-right" })
    // A parent loop (OpenCode never writes one) stops where it closes, so the walk always ends.
    expect(state.queue.map((entry) => [entry.id, entry.target?.directory ?? null])).toEqual([
      ["ses_root", "/w"],
      ["ses_y", null],
      ["ses_x", null],
      ["ses_orphan", null],
    ])
  })

  it("explains a queue request it cannot act on", () => {
    expect(run(createBrowser(left, null, 5), { type: "enqueue", direction: "to-right" }).notice).toBe(
      "Open a second profile with --right to sync between sides.",
    )
    expect(run(two(), { type: "filter-input", text: "zz" }, { type: "enqueue", direction: "to-right" }).notice).toBe("Nothing selected.")
  })

  it("is edited in its own view: move, Magic Context preference for one or all, scope, remove, clear", () => {
    const base = run(paired(2), { type: "mark-all" }, { type: "enqueue", direction: "to-right" }, { type: "view" })
    expect(base.view).toBe("queue")
    expect(run(base, { type: "view" }).view).toBe("list")
    expect(run(base, { type: "view", view: "list" }).view).toBe("list")
    expect(run(base, { type: "queue-move", delta: 5 }).queueCursor).toBe(3)
    expect(run(base, { type: "queue-move", delta: -5 }).queueCursor).toBe(0)
    const planned = { action: "keep" as const, relation: "same" as const, reason: null, context: "Magic Context copied" }
    const checked = { ...base, queue: base.queue.map((entry) => ({ ...entry, planned })) }
    const one = run(checked, { type: "queue-move", delta: 1 }, { type: "prefer" })
    expect(one.queue.map((entry) => [entry.prefer, entry.planned === null])).toEqual([
      ["further", false],
      ["keep", true],
      ["further", false],
      ["further", false],
    ])
    expect(run(one, { type: "prefer" }, { type: "prefer" }).queue[1]!.prefer).toBe("further")
    expect(run(one, { type: "prefer", all: true }).queue.map((entry) => entry.prefer)).toEqual(["replace", "replace", "replace", "replace"])
    const scoped = run(checked, { type: "scope" })
    expect([scoped.scope, scoped.queue.every((entry) => entry.planned === null), run(scoped, { type: "scope" }).scope]).toEqual(["sessions", true, "all"])
    const removed = run(base, { type: "queue-move", delta: 3 }, { type: "unqueue" })
    expect([removed.queue.map((entry) => entry.id), removed.queueCursor]).toEqual([["ses_c", "ses_a", "ses_b"], 2])
    expect(run(base, { type: "queue-clear" })).toMatchObject({ queue: [], queueCursor: 0 })
    const empty = run(base, { type: "queue-clear" })
    expect(run(empty, { type: "prefer" })).toEqual({ ...empty, notice: null })
    expect(run(empty, { type: "unqueue" }).queue).toEqual([])
    expect(queueWindowStart(run(base, { type: "queue-move", delta: 1 }))).toBe(0)
    expect(queueWindowStart({ ...base, listHeight: 1, queueCursor: 1 })).toBe(1)
  })

  it("turns the queue into requests per direction, and takes each entry's result from a run", () => {
    const state = run(paired(), { type: "mark-all" }, { type: "enqueue", direction: "to-right" }, { type: "view" }, { type: "queue-move", delta: 1 }, { type: "prefer" })
    const toLeft = run(state, { type: "view" }, { type: "home" }, { type: "move", delta: 1 }, { type: "enqueue", direction: "to-left" })
    expect(requestsFor(toLeft.queue, "to-right")).toEqual({ ids: ["ses_a", "ses_b", "ses_d"], preferFor: { ses_a: "keep" } })
    expect(requestsFor(toLeft.queue, "to-left")).toEqual({ ids: ["ses_c"], preferFor: {} })
    const diverged = { action: "skip" as const, relation: "diverged" as const, reason: "diverged" as const, context: null }
    const result = reduce(state, { type: "applied", result: ["Dry run: …"], changed: false, planned: { ses_c: diverged } })
    expect([result.queue[0]!.planned, result.queue[1]!.planned, queueSummary(result.queue).diverged]).toEqual([diverged, null, 1])
  })
})

describe("Browser background actions", () => {
  it("keeps the notice when the terminal is resized or npm answers, and records the release", () => {
    const noticed = run(two(), { type: "notice", text: "Dry run: fine" })
    const release = { versions: { pinned: "0.47.0", loaded: "0.47.0", latest: "0.48.0" }, newer: true }
    const after = run(noticed, { type: "resize", listHeight: 7 }, { type: "release", release })
    expect([after.notice, after.release, after.listHeight]).toEqual(["Dry run: fine", release, 7])
    expect(run(after, { type: "move", delta: 1 }).notice).toBeNull()
    expect(two().release).toBeNull()
  })
})

describe("Browser rebuild requests", () => {
  it("asks for the marked sessions of the focused side, or the selected one, and any other action cancels", () => {
    const one = run(two(), { type: "move", delta: 1 }, { type: "rebuild-ask", command: "wrapup" })
    expect(one.confirm).toEqual({ command: "wrapup", side: "left", ids: ["ses_a"] })
    expect(one.notice).toBe(
      "W again: /ctx-wrapup (summarise what lags) on 1 session of the left, through the running OpenCode; it spends historian tokens. Any other key cancels.",
    )
    expect(run(one, { type: "move", delta: 1 }).confirm).toBeNull()
    expect(run(one, { type: "release", release: { versions: { pinned: null, loaded: null, latest: null }, newer: false } }).confirm).toEqual(one.confirm)
    // Marked sessions the focused side does not have are left out.
    const marked = run(paired(), { type: "mark-all" }, { type: "focus", side: "right" }, { type: "rebuild-ask", command: "recomp" })
    expect(marked.confirm).toEqual({ command: "recomp", side: "right", ids: ["ses_c", "ses_a", "ses_b", "ses_e"] })
    expect(marked.notice).toStartWith("R again: /ctx-recomp (rebuild every summary) on 4 sessions of the right")
    const nothing = run(two(), { type: "filter-input", text: "zz" }, { type: "rebuild-ask", command: "wrapup" })
    expect([nothing.confirm, nothing.notice]).toEqual([null, "Nothing selected on the left."])
  })
})
