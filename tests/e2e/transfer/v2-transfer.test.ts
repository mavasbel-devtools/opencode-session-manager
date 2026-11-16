// E2E tier, OpenCode 2 lane: the real v2 TUI entry, found and loaded by the
// real OpenCode 2.0.14 plugin host (`Host.resolve` + `Host.load` from
// `@opencode/plugin/host`), in this process so coverage is measured. Real
// filesystem; the destination folders are really created.
//
// Stand-ins, both unavoidable in-process: the TUI surface (the dialog stack,
// toasts, router, keymap — owned by the host's TUI app; the folder browser is
// painted by OpenTUI's test renderer and its keys run through the layer it
// registers) and the client (owned by the host's server). The client stand-in keeps the v2.0.14 response shapes of
// `session.list`, `project.list` and `session.move`; the live tier drives the
// real ones.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { Host } from "@opencode/plugin/host"
import type { V2Client, V2Project, V2Session } from "@session-manager/infrastructure/host/V2Client"
import { rowText } from "@session-manager/infrastructure/adapters/inbound/tui/FolderBrowserDialogV2Adapter"
import type { V2SlotClaim, V2TuiContext } from "@session-manager/infrastructure/host/V2TuiContext"
import { dialogHost } from "@test/support/fakes/dialog-host"
import { removeTemporary } from "@test/support/live/process"

const entries = Host.resolve({ directory: path.resolve(import.meta.dir, "../../../src/main/v2") })

type Loaded = { default: { id: string; setup: (context: V2TuiContext) => () => void } }
type Browser = ReturnType<typeof dialogHost>

interface Script {
  readonly route: { type: string; sessionID?: string }
  readonly sessions?: V2Session[]
  readonly projects?: V2Project[]
  /** The session picker's answer. */
  readonly selects?: unknown[]
  /** Drives the folder browser once it is shown (none: the browser is not expected). */
  readonly browse?: (browser: Browser) => Promise<void>
  readonly listError?: unknown
  readonly moveError?: unknown
}

let root = ""
let previousHome: string | undefined

function session(id: string, directory: string, extra: Partial<V2Session> = {}): V2Session {
  return { id, projectID: "p", time: { updated: 1 }, location: { directory }, ...extra }
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 40))

/** Loads the TUI entry through the real host, registers it, and runs `/transfer-session` once. */
async function run(script: Script) {
  const selects = [...(script.selects ?? [])]
  const shown = { selects: [] as any[], moves: [] as any[], lists: [] as any[], frames: [] as string[] }
  const claims: V2SlotClaim[] = []
  const browser = dialogHost({ route: script.route })

  const client: V2Client = {
    session: {
      list: async (input) => {
        shown.lists.push(input)
        if (script.listError !== undefined) throw script.listError
        return { data: script.sessions ?? [] }
      },
      move: async (input) => {
        if (script.moveError !== undefined) throw script.moveError
        shown.moves.push(input)
      },
    },
    project: { list: async () => script.projects ?? [] },
  }
  const context: V2TuiContext = {
    ...browser.context,
    client,
    ui: {
      ...browser.context.ui,
      slot: (claim) => {
        claims.push(claim)
        return () => undefined
      },
      dialog: {
        ...browser.context.ui.dialog,
        select: async (options: any) => {
          shown.selects.push(options)
          return selects.shift() as any
        },
      },
    },
  }

  const plugin = (await Host.load(entries.tui!)) as Loaded
  const dispose = plugin.default.setup(context)
  // The host renders the `app` slot inside its component tree; that is where the keymap layer is registered.
  for (const claim of claims) if ("append" in claim) claim.render()
  const command = browser.layers()[0]!().commands.find((entry) => entry.id === "session.transfer")!
  command.run()
  await settle()
  if (script.browse !== undefined) {
    await browser.ready()
    shown.frames.push(await browser.frame())
    await script.browse(browser)
    await settle()
  }
  browser.destroy()
  dispose()
  return { shown, command, toasts: browser.toasts }
}

beforeAll(() => {
  previousHome = process.env["HOME"]
})

afterAll(() => {
  if (previousHome === undefined) delete process.env["HOME"]
  else process.env["HOME"] = previousHome
})

beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "session-manager-v2-e2e-")))
  process.env["HOME"] = path.join(root, "home")
  fs.mkdirSync(process.env["HOME"])
})

afterEach(async () => {
  await removeTemporary(root)
})

describe("v2 /transfer-session, loaded by the real 2.0.14 Host", () => {
  it("is offered on the palette and as /transfer-session, with no alias and no description", async () => {
    const { command } = await run({ route: { type: "home" } })
    expect(command).toEqual({ id: "session.transfer", title: "Transfer session", group: "Session", palette: true, slash: { name: "transfer-session" }, run: expect.any(Function) })
  })

  it("browses the known folders that exist (projects, worktrees, other sessions) and moves the open session to one", async () => {
    const target = path.join(root, "home", "work", "target")
    fs.mkdirSync(target, { recursive: true })
    fs.mkdirSync(path.join(root, "sandbox"))
    const { shown, toasts } = await run({
      route: { type: "session", sessionID: "ses_open" },
      projects: [{ id: "p1", canonical: target, sandboxes: [path.join(root, "sandbox"), path.join(root, "gone")] }],
      sessions: [session("ses_other", root), session("ses_child", path.join(root, "child"), { parentID: "ses_other" }), session("ses_root", "/")],
      browse: async (browser) => {
        await browser.press("down")
        await browser.press("return")
      },
    })
    expect(shown.lists).toEqual([{ limit: 200, order: "desc" }])
    // The dialog fits each row into 82 columns (its 88-column width inside the 100-column fake
    // renderer): a temporary folder longer than that keeps its start and end around `…`.
    const dialogWidth = 82
    const row = (label: string, directory: string, active: boolean) =>
      rowText({ kind: "folder", label, directory }, active, dialogWidth).trim()
    const rows = shown.frames[0]!.split("\n").map((line) => line.trim()).filter((line) => line.startsWith("› ") || line.startsWith("~") || line.startsWith("/"))
    expect(rows).toEqual([row("~/work/target", target, true), row(root, root, false), row(path.join(root, "sandbox"), path.join(root, "sandbox"), false)])
    expect(shown.moves).toEqual([{ sessionID: "ses_open", directory: root }])
    expect(toasts).toEqual([{ variant: "success", title: "Session transferred", message: `Moved to ${root}`, duration: 4000 }])
  })

  it("picks a session first on the home screen, then completes a typed path from disk and creates a new folder after a second Enter", async () => {
    fs.mkdirSync(path.join(root, "home", "brand", "older"), { recursive: true })
    const { shown } = await run({
      route: { type: "home" },
      sessions: [session("ses_titled", root, { title: "Titled" }), session("ses_untitled", path.join(root, "home", "x"))],
      selects: ["ses_untitled"],
      browse: async (browser) => {
        await browser.type("~/br")
        await browser.waitFor("› ~/brand")
        await browser.press("right")
        await browser.waitFor("~/brand  · this folder")
        await browser.type("new")
        await browser.waitFor("~/brand/new  · new folder")
        await browser.press("return")
        await browser.waitFor("Enter again to create ~/brand/new")
        await browser.press("return")
      },
    })
    expect(shown.selects[0].options.map((entry: any) => [entry.title, entry.description, entry.footer])).toEqual([
      ["Titled", root, "s_titled"],
      ["ses_untitled", "~/x", "untitled"],
    ])
    const created = path.join(root, "home", "brand", "new")
    expect(fs.statSync(created).isDirectory()).toBe(true)
    expect(shown.moves).toEqual([{ sessionID: "ses_untitled", directory: created }])
  })

  it("scrolls a long folder, fits long paths, goes up with ←, skips a folder it cannot read, and takes a click", async () => {
    const long = path.join(root, "home", "projects")
    for (let index = 0; index < 20; index++) fs.mkdirSync(path.join(long, `p${String(index).padStart(2, "0")}`), { recursive: true })
    const deep = path.join(root, "home", "a-very-long-folder-name-that-will-not-fit", "and-another-long-folder-name-below-it", "leaf")
    fs.mkdirSync(deep, { recursive: true })
    const locked = path.join(root, "home", "locked")
    fs.mkdirSync(locked)
    fs.chmodSync(locked, 0o000)
    let frames: string[] = []
    const { shown } = await run({
      route: { type: "session", sessionID: "ses_open" },
      browse: async (browser) => {
        await browser.type("~/projects/")
        await browser.waitFor("~/projects  · this folder")
        await browser.press("pagedown")
        await browser.press("pagedown")
        frames.push(await browser.frame())
        await browser.press("pageup")
        await browser.press("up")
        await browser.press("left")
        await browser.waitFor("› ~  · this folder")
        await browser.type("locked/")
        frames.push(await browser.waitFor("~/locked  · this folder"))
        await browser.backspace(7)
        await browser.type(`${deep.slice(path.join(root, "home").length + 1)}`)
        frames.push(await browser.waitFor("leaf  · this folder"))
        await browser.click("leaf  · this folder")
      },
    })
    fs.chmodSync(locked, 0o755)
    // Twelve rows at a time, scrolled to the highlight.
    const scrolled = frames[0]!.split("\n").filter((line) => line.includes("~/projects") && line.trim() !== "~/projects/")
    expect(scrolled.length).toBe(12)
    expect(scrolled.some((line) => line.includes("› ~/projects/p"))).toBe(true)
    // A folder it cannot read lists only itself.
    expect(frames[1]!.split("\n").filter((line) => line.includes("~/locked")).map((line) => line.trim())).toEqual(["~/locked/", "› ~/locked  · this folder"])
    // A path longer than the dialog keeps its end.
    expect(frames[2]).toContain("…")
    expect(shown.moves).toEqual([{ sessionID: "ses_open", directory: deep }])
  })

  it("does nothing when the session picker or the folder browser is closed", async () => {
    for (const script of [
      { route: { type: "home" }, sessions: [session("ses_a", root)], selects: [undefined] },
      { route: { type: "session", sessionID: "ses_a" }, browse: async (browser: Browser) => browser.escape() },
    ] satisfies Script[]) {
      const { shown, toasts } = await run(script)
      expect({ moves: shown.moves, toasts }).toEqual({ moves: [], toasts: [] })
    }
  })

  it("warns when there is no session to transfer", async () => {
    const { toasts } = await run({ route: { type: "home" } })
    expect(toasts).toEqual([{ variant: "warning", title: "Transfer session", message: "No sessions found." }])
  })

  it("reports an empty session id as a failed transfer", async () => {
    const blank = await run({ route: { type: "session", sessionID: "" }, browse: (browser) => browser.press("return"), projects: [{ id: "p", canonical: root, sandboxes: [] }] })
    expect(blank.toasts).toEqual([{ variant: "error", title: "Transfer failed", message: "Session not found: " }])
  })

  it("reports a move the host rejects, whatever it rejects with", async () => {
    const projects = [{ id: "p", canonical: root, sandboxes: [] }]
    const failed = await run({ route: { type: "session", sessionID: "ses_a" }, projects, browse: (browser) => browser.press("return"), moveError: new Error("Directory is unavailable") })
    expect(failed.toasts).toEqual([{ variant: "error", title: "Transfer failed", message: "Directory is unavailable" }])
    const odd = await run({ route: { type: "session", sessionID: "ses_a" }, projects, browse: (browser) => browser.press("return"), moveError: "busy" })
    expect(odd.toasts).toEqual([{ variant: "error", title: "Transfer failed", message: "busy" }])
  })

  it("reports a host that cannot list sessions", async () => {
    const { toasts } = await run({ route: { type: "home" }, listError: new Error("server unreachable") })
    expect(toasts).toEqual([{ variant: "error", title: "Transfer session", message: "server unreachable" }])
  })
})
