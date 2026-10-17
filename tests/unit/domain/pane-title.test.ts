import { describe, expect, it } from "bun:test"
import { herdrPane } from "@session-manager/domain/model/HerdrPane"
import { PANE_TITLE_LIMIT, paneTitle, rootSession, type SessionLink } from "@session-manager/domain/model/PaneTitle"

describe("paneTitle", () => {
  it("keeps a title that fits, as written", () => {
    expect(paneTitle("Overleaf & ResearchGate Lean Formalization")).toBe("Overleaf & ResearchGate Lean Formalization")
  })

  it("turns control characters and runs of whitespace into one space and trims the ends", () => {
    expect(paneTitle("  Relational\tDBs\n\n- generators\u0007 ")).toBe("Relational DBs - generators")
  })

  it("has no title for nothing, an empty title or only whitespace", () => {
    expect([paneTitle(undefined), paneTitle(""), paneTitle(" \t\n")]).toEqual([undefined, undefined, undefined])
  })

  it("keeps exactly the limit, and ends a longer title in … within the limit", () => {
    const exact = "a".repeat(PANE_TITLE_LIMIT)
    expect(paneTitle(exact)).toBe(exact)
    const shown = paneTitle(`${"word ".repeat(20)}tail`)!
    expect([...shown]).toHaveLength(PANE_TITLE_LIMIT)
    expect(shown.endsWith("word…")).toBe(true)
    // A cut right after a space drops the space before the mark.
    expect(paneTitle(`${"a".repeat(PANE_TITLE_LIMIT - 2)} tail`)).toBe(`${"a".repeat(PANE_TITLE_LIMIT - 2)}…`)
    expect(PANE_TITLE_LIMIT).toBe(80)
  })

  it("counts characters, not UTF-16 units, so an emoji is never cut in half", () => {
    const title = "🧠".repeat(PANE_TITLE_LIMIT + 5)
    const shown = paneTitle(title)!
    expect([...shown]).toHaveLength(PANE_TITLE_LIMIT)
    expect(shown).toBe(`${"🧠".repeat(PANE_TITLE_LIMIT - 1)}…`)
  })
})

describe("rootSession", () => {
  const sessions = new Map<string, SessionLink>([
    ["ses_root", { id: "ses_root", title: "Root" }],
    ["ses_child", { id: "ses_child", parentID: "ses_root", title: "Child" }],
    ["ses_grandchild", { id: "ses_grandchild", parentID: "ses_child" }],
    ["ses_orphan", { id: "ses_orphan", parentID: "ses_missing" }],
    ["ses_a", { id: "ses_a", parentID: "ses_b" }],
    ["ses_b", { id: "ses_b", parentID: "ses_a" }],
  ])
  const lookup = (id: string) => sessions.get(id)

  it("is the session itself when it has no parent", () => {
    expect(rootSession("ses_root", lookup)).toEqual({ id: "ses_root", title: "Root" })
  })

  it("walks up a sub-agent chain to its top", () => {
    expect(rootSession("ses_grandchild", lookup)?.id).toBe("ses_root")
  })

  it("is unknown while the session or a parent is not loaded", () => {
    expect([rootSession("ses_unloaded", lookup), rootSession("ses_orphan", lookup)]).toEqual([undefined, undefined])
  })

  it("is unknown for a chain that loops", () => {
    expect(rootSession("ses_a", lookup)).toBeUndefined()
  })
})

describe("herdrPane", () => {
  const inside = { HERDR_ENV: "1", HERDR_SOCKET_PATH: "/run/herdr.sock", HERDR_PANE_ID: "w1:p1" }

  it("reads the socket and the pane Herdr gives a process in a pane", () => {
    expect(herdrPane(inside)).toEqual({ socketPath: "/run/herdr.sock", paneID: "w1:p1" })
  })

  it("is outside Herdr without HERDR_ENV=1, a socket or a pane", () => {
    expect([
      herdrPane({}),
      herdrPane({ ...inside, HERDR_ENV: "0" }),
      herdrPane({ ...inside, HERDR_SOCKET_PATH: "" }),
      herdrPane({ ...inside, HERDR_PANE_ID: undefined }),
    ]).toEqual([undefined, undefined, undefined, undefined])
  })
})
