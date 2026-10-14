import { afterEach, describe, expect, it } from "bun:test"
import { BrowseFoldersUseCase } from "@session-manager/application/BrowseFoldersUseCase"
import { FolderBrowserDialogV2Adapter, footerText, rowText } from "@session-manager/infrastructure/adapters/inbound/tui/FolderBrowserDialogV2Adapter"
import { dialogHost } from "@test/support/fakes/dialog-host"
import { FakeDirectoryListingAdapter } from "@test/support/fakes/transfer-ports"

const HOME = "/home/user"
const listing = new FakeDirectoryListingAdapter(["/home/user/Dev/repos", "/home/user/Dev/AIML", "/home/user/docs", "/tmp/x"])
const ROOTS = ["/home/user/Dev/AIML", "/home/user/docs", "/tmp/x"]
const REQUEST = { title: "Transfer session (abcd1234)", home: HOME, roots: ROOTS }

let host: ReturnType<typeof dialogHost> | undefined
afterEach(() => {
  host?.destroy()
  host = undefined
})

async function opened(theme?: Parameters<typeof dialogHost>[0]) {
  host = dialogHost(theme)
  const picked = new FolderBrowserDialogV2Adapter(new BrowseFoldersUseCase(listing)).pick(host.context, REQUEST)
  await host.ready()
  return { host, picked }
}

describe("FolderBrowserDialogV2Adapter", () => {
  it("shows the known folders once each, in a large dialog, the first highlighted", async () => {
    const { host } = await opened()
    const frame = await host.frame()
    expect(frame).toContain("Transfer session (abcd1234)")
    expect(frame).toContain("› ~/Dev/AIML")
    expect(frame).toContain("  ~/docs")
    expect(frame).toContain("  /tmp/x")
    expect(frame.match(/docs/g)?.length).toBe(1)
    expect(frame).toContain("↑↓ select   → open folder   ← parent folder   enter move here   esc cancel")
    expect(host.sizes).toEqual(["large"])
  })

  it("browses with the arrows and the path box, and resolves with the folder Enter chooses", async () => {
    const { host, picked } = await opened()
    await host.press("down")
    expect(await host.frame()).toContain("› ~/docs")
    await host.press("up")
    await host.press("pagedown")
    await host.press("pageup")
    expect(await host.frame()).toContain("› ~/Dev/AIML")
    await host.press("right")
    expect(await host.waitFor("~/Dev/AIML/")).toContain("› ~/Dev/AIML  · this folder")
    await host.press("left")
    await host.press("left")
    const up = await host.frame()
    expect(up).toContain("› ~  · this folder")
    expect(up).toContain("  ~/Dev")
    await host.type("De")
    expect(await host.waitFor("› ~/Dev")).toContain("~/De  · new folder")
    await host.press("return")
    expect(await picked).toBe("/home/user/Dev")
    expect([host.clears(), host.shown()]).toEqual([1, false])
  })

  it("filters the known folders by typed text, and tells when none matches", async () => {
    const { host } = await opened()
    await host.type("zzz")
    expect(await host.waitFor("No known folder matches")).toContain("No known folder matches; type a path starting with ~ or /")
  })

  it("asks for a second Enter before a folder that does not exist", async () => {
    const { host, picked } = await opened()
    await host.type("/tmp/new")
    await host.waitFor("/tmp/new  · new folder")
    await host.press("return")
    expect(await host.waitFor("Enter again to create /tmp/new")).not.toContain("↑↓ select")
    await host.press("return")
    expect(await picked).toBe("/tmp/new")
  })

  it("chooses a clicked folder", async () => {
    const { host, picked } = await opened()
    await host.click("/tmp/x")
    expect(await picked).toBe("/tmp/x")
  })

  it("resolves with nothing when the host closes it, and paints with the host's plain theme too", async () => {
    const { host, picked } = await opened({ theme: { text: { muted: "#808080" } } })
    expect(await host.frame()).toContain("› ~/Dev/AIML")
    host.escape()
    expect(await picked).toBeUndefined()
  })

  it("fits rows and the confirmation into the dialog's width", () => {
    const row = { label: "~/AppData/Local/Temp/claude/scratchpad/v2-host", directory: "/x", kind: "new" as const }
    expect(rowText(row, true, 30)).toBe("› ~/Ap…d/v2-host  · new folder")
    expect(rowText(row, false, 30).startsWith("  ")).toBe(true)
    const state = { home: HOME, roots: [], text: "", rows: [row], highlight: 0, pending: "/x" }
    expect(footerText(state, 40)).toBe("Enter again to create ~/App…hpad/v2-host")
    expect(footerText({ ...state, pending: null }, 40)).toContain("↑↓ select")
  })
})
