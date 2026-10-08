// E2E tier, OpenCode 2 lane: the real v2 TUI entry, found and loaded by the
// real OpenCode 2.0.14 plugin host (`Host.resolve` + `Host.load` from
// `@opencode/plugin/host`), in this process so coverage is measured. Real
// filesystem; the destination folders are really created.
//
// Stand-ins, both unavoidable in-process: the TUI surface (dialogs, toasts,
// router, keymap — owned by the host's TUI app) and the client (owned by the
// host's server). The client stand-in keeps the v2.0.14 response shapes of
// `session.list`, `project.list` and `session.move`; the live tier drives the
// real ones.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { Host } from "@opencode/plugin/host"
import type { V2Client, V2Project, V2Session } from "@session-manager/infrastructure/host/V2Client"
import type { V2KeymapLayer, V2SlotClaim, V2TuiContext } from "@session-manager/infrastructure/host/V2TuiContext"
import { removeTemporary } from "@test/support/live/process"

const CUSTOM = "__transfer_custom_path__"
const entries = Host.resolve({ directory: path.resolve(import.meta.dir, "../../../src/main/v2") })

type Loaded = { default: { id: string; setup: (context: V2TuiContext) => () => void } }

interface Script {
  readonly route: { type: string; sessionID?: string }
  readonly sessions?: V2Session[]
  readonly projects?: V2Project[]
  readonly selects?: unknown[]
  readonly prompts?: Array<string | undefined>
  readonly listError?: unknown
  readonly moveError?: unknown
}

let root = ""
let previousHome: string | undefined

function session(id: string, directory: string, extra: Partial<V2Session> = {}): V2Session {
  return { id, projectID: "p", time: { updated: 1 }, location: { directory }, ...extra }
}

/** Loads the TUI entry through the real host, registers it, and runs `/transfer-session` once. */
async function run(script: Script) {
  const selects = [...(script.selects ?? [])]
  const prompts = [...(script.prompts ?? [])]
  const shown = { selects: [] as any[], prompts: [] as any[], toasts: [] as any[], moves: [] as any[], lists: [] as any[] }
  const claims: V2SlotClaim[] = []
  const layers: Array<() => V2KeymapLayer> = []

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
    theme: { text: { muted: "#808080" } },
    client,
    keymap: { layer: (layer) => void layers.push(layer) },
    ui: {
      slot: (claim) => {
        claims.push(claim)
        return () => undefined
      },
      dialog: {
        select: async (options: any) => {
          shown.selects.push(options)
          return selects.shift() as any
        },
        prompt: async (options) => {
          shown.prompts.push(options)
          return prompts.shift()
        },
      },
      toast: { show: (toast) => void shown.toasts.push(toast) },
      router: { current: () => script.route },
    },
  }

  const plugin = (await Host.load(entries.tui!)) as Loaded
  const dispose = plugin.default.setup(context)
  // The host renders the `app` slot inside its component tree; that is where the keymap layer is registered.
  for (const claim of claims) if ("append" in claim) claim.render()
  const command = layers[0]!().commands.find((entry) => entry.id === "session.transfer")!
  command.run()
  await new Promise((resolve) => setTimeout(resolve, 40))
  dispose()
  return { shown, command }
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
  it("is offered on the palette and as /transfer-session (alias /relocate)", async () => {
    const { command } = await run({ route: { type: "home" } })
    expect(command).toMatchObject({ title: "Transfer session", group: "Session", palette: true, slash: { name: "transfer-session", aliases: ["relocate"] } })
  })

  it("moves the open session to a directory known from projects, worktrees and other sessions", async () => {
    const target = path.join(root, "home", "work", "target")
    fs.mkdirSync(target, { recursive: true })
    const { shown } = await run({
      route: { type: "session", sessionID: "ses_open" },
      projects: [{ id: "p1", canonical: target, sandboxes: [path.join(root, "sandbox")] }],
      sessions: [session("ses_other", root), session("ses_child", path.join(root, "child"), { parentID: "ses_other" })],
      selects: [target],
    })
    expect(shown.lists).toEqual([{ limit: 200, order: "desc" }])
    expect(shown.selects[0].options.map((entry: any) => entry.title)).toEqual([
      "Enter custom path…",
      root,
      "~/work/target",
      path.join(root, "sandbox"),
    ])
    expect(shown.moves).toEqual([{ sessionID: "ses_open", directory: target }])
    expect(shown.toasts).toEqual([{ variant: "success", title: "Session transferred", message: `Moved to ${target}`, duration: 4000 }])
  })

  it("picks a session first on the home screen, then creates a ~/ custom destination", async () => {
    const { shown } = await run({
      route: { type: "home" },
      sessions: [session("ses_titled", root, { title: "Titled" }), session("ses_untitled", root)],
      selects: ["ses_untitled", CUSTOM],
      prompts: ["  ~/brand/new  "],
    })
    expect(shown.selects[0].options.map((entry: any) => [entry.title, entry.footer])).toEqual([
      ["Titled", "s_titled"],
      ["ses_untitled", "untitled"],
    ])
    const created = path.join(root, "home", "brand", "new")
    expect(fs.statSync(created).isDirectory()).toBe(true)
    expect(shown.moves).toEqual([{ sessionID: "ses_untitled", directory: created }])
  })

  it("does nothing when a picker or the prompt is cancelled", async () => {
    for (const script of [
      { route: { type: "home" }, sessions: [session("ses_a", root)], selects: [undefined] },
      { route: { type: "session", sessionID: "ses_a" }, selects: [undefined] },
      { route: { type: "session", sessionID: "ses_a" }, selects: [CUSTOM], prompts: [undefined] },
    ] satisfies Script[]) {
      const { shown } = await run(script)
      expect({ moves: shown.moves, toasts: shown.toasts }).toEqual({ moves: [], toasts: [] })
    }
  })

  it("warns when there is no session to transfer", async () => {
    const { shown } = await run({ route: { type: "home" } })
    expect(shown.toasts).toEqual([{ variant: "warning", title: "Transfer session", message: "No sessions found." }])
  })

  it("reports an empty custom path and an empty session id as failed transfers", async () => {
    const empty = await run({ route: { type: "session", sessionID: "ses_a" }, selects: [CUSTOM], prompts: ["   "] })
    expect(empty.shown.toasts).toEqual([
      { variant: "error", title: "Transfer failed", message: 'Invalid directory "   ": Directory path cannot be empty' },
    ])
    const blank = await run({ route: { type: "session", sessionID: "" }, selects: [root] })
    expect(blank.shown.toasts).toEqual([{ variant: "error", title: "Transfer failed", message: "Session not found: " }])
  })

  it("reports a move the host rejects, whatever it rejects with", async () => {
    const failed = await run({ route: { type: "session", sessionID: "ses_a" }, selects: [root], moveError: new Error("Directory is unavailable") })
    expect(failed.shown.toasts).toEqual([{ variant: "error", title: "Transfer failed", message: "Directory is unavailable" }])
    const odd = await run({ route: { type: "session", sessionID: "ses_a" }, selects: [root], moveError: "busy" })
    expect(odd.shown.toasts).toEqual([{ variant: "error", title: "Transfer failed", message: "busy" }])
  })

  it("reports a host that cannot list sessions", async () => {
    const { shown } = await run({ route: { type: "home" }, listError: new Error("server unreachable") })
    expect(shown.toasts).toEqual([{ variant: "error", title: "Transfer session", message: "server unreachable" }])
  })
})
