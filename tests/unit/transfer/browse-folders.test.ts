import { describe, expect, it } from "bun:test"
import { BrowseFoldersUseCase } from "@session-manager/application/BrowseFoldersUseCase"
import type { FolderBrowserState } from "@session-manager/domain/model/FolderBrowser"
import { FakeDirectoryListingAdapter } from "@test/support/fakes/transfer-ports"

const HOME = "/home/user"
const listing = new FakeDirectoryListingAdapter([
  "/home/user/Dev/repos",
  "/home/user/Dev/AIML",
  "/home/user/Dev/archive",
  "/home/user/Dev/.cache",
  "/home/user/docs",
  "/tmp/x",
])
const browser = new BrowseFoldersUseCase(listing)
const ROOTS = ["/home/user/Dev/AIML", "/home/user/docs", "/tmp/x"]

const rows = (state: FolderBrowserState) => state.rows.map((row) => `${row.kind}:${row.label}`)
const open = () => browser.open(HOME, ROOTS)

describe("BrowseFoldersUseCase", () => {
  it("opens on the known folders, and filters them by any text that is not a path", () => {
    const state = open()
    expect([state.text, rows(state), state.highlight, state.pending]).toEqual(["", ["folder:~/Dev/AIML", "folder:~/docs", "folder:/tmp/x"], 0, null])
    expect(rows(browser.type(state, "DOC"))).toEqual(["folder:~/docs"])
    expect(rows(browser.type(state, "nothing"))).toEqual([])
  })

  it("lists a typed folder first, then its folders by name; hidden ones only after a dot", () => {
    const state = browser.type(open(), "~/Dev/")
    expect([rows(state), state.highlight]).toEqual([["here:~/Dev", "folder:~/Dev/AIML", "folder:~/Dev/archive", "folder:~/Dev/repos"], 0])
    expect(rows(browser.type(state, "~/Dev/."))).toEqual(["new:~/Dev/.", "folder:~/Dev/.cache"])
  })

  it("completes the name being typed, highlighting the first completion; the exact folder is not listed twice", () => {
    const typing = browser.type(open(), "~/Dev/a")
    expect([rows(typing), typing.highlight]).toEqual([["new:~/Dev/a", "folder:~/Dev/AIML", "folder:~/Dev/archive"], 1])
    const exact = browser.type(open(), "~/Dev/repos")
    expect([rows(exact), exact.highlight]).toEqual([["here:~/Dev/repos"], 0])
    const none = browser.type(open(), "~/Dev/zz")
    expect([rows(none), none.highlight]).toEqual([["new:~/Dev/zz"], 0])
    expect(rows(browser.type(open(), "/missing/x"))).toEqual(["new:/missing/x"])
  })

  it("moves the highlight, wrapping, and does nothing over an empty list", () => {
    const state = open()
    expect([browser.move(state, 1).highlight, browser.move(state, -1).highlight, browser.move(state, 4).highlight]).toEqual([1, 2, 1])
    const empty = browser.type(state, "nothing")
    expect(browser.move(empty, 1)).toBe(empty)
  })

  it("goes into the highlighted folder with →, never into one that does not exist", () => {
    const into = browser.enter(browser.move(open(), 1))
    expect([into.text, rows(into)]).toEqual(["~/docs/", ["here:~/docs"]])
    const absolute = browser.enter(browser.move(open(), 2))
    expect(absolute.text).toBe("/tmp/x/")
    const fresh = browser.type(open(), "~/Dev/zz")
    expect(browser.enter(fresh)).toEqual({ ...fresh, pending: null })
    const empty = browser.type(open(), "nothing")
    expect(browser.enter(empty).text).toBe("nothing")
  })

  it("goes up with ←, and only from a path", () => {
    const up = browser.up(browser.type(open(), "~/Dev/re"))
    expect([up.text, rows(up)[0]]).toEqual(["~/Dev/", "here:~/Dev"])
    expect(browser.up(up).text).toBe("~/")
    const filter = browser.type(open(), "doc")
    expect(browser.up(filter)).toEqual(filter)
  })

  it("chooses an existing folder at once, and a missing one only on the second Enter", () => {
    expect(browser.choose(open()).directory).toBe("/home/user/Dev/AIML")
    const here = browser.type(open(), "~/Dev/")
    expect(browser.choose(here).directory).toBe("/home/user/Dev")
    const fresh = browser.type(open(), "~/Dev/new")
    const first = browser.choose(fresh)
    expect([first.directory, first.state.pending]).toEqual([null, "/home/user/Dev/new"])
    const second = browser.choose(first.state)
    expect([second.directory, second.state.pending]).toEqual(["/home/user/Dev/new", null])
    // Anything else in between asks again.
    expect(browser.choose(browser.type(first.state, "~/Dev/new")).directory).toBeNull()
    expect(browser.choose(browser.type(open(), "nothing"))).toEqual({ state: browser.type(open(), "nothing"), directory: null })
  })
})
