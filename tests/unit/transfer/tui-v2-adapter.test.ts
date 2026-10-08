import { describe, it, expect } from "bun:test"
import os from "node:os"
import path from "node:path"
import {
  SessionTransferV2TuiAdapter,
  type V2TransferServices,
} from "@session-manager/infrastructure/adapters/inbound/tui/SessionTransferV2TuiAdapter"
import type { V2KeymapLayer, V2TuiContext } from "@session-manager/infrastructure/host/V2TuiContext"
import { fakeV2Client } from "@test/support/fakes/hosts"
import { MoveSessionUseCase } from "@session-manager/application/MoveSessionUseCase"
import { BuildDirectoryOptionsUseCase } from "@session-manager/application/BuildDirectoryOptionsUseCase"
import { FakeFileSystemAdapter, FakeSessionHostAdapter } from "@test/support/fakes/transfer-ports"

const CUSTOM = "__transfer_custom_path__"

function makeServices() {
  const host = new FakeSessionHostAdapter()
  const fs = new FakeFileSystemAdapter()
  const services: V2TransferServices = {
    host,
    moveSession: new MoveSessionUseCase(host, fs),
    buildDirectoryOptions: new BuildDirectoryOptionsUseCase(host, fs),
  }
  return { host, fs, services }
}

function makeContext(input: {
  route: { type: string; sessionID?: string }
  selects?: unknown[]
  prompts?: Array<string | undefined>
}) {
  const selects = [...(input.selects ?? [])]
  const prompts = [...(input.prompts ?? [])]
  const selectCalls: any[] = []
  const promptCalls: any[] = []
  const toasts: any[] = []
  const layers: Array<() => V2KeymapLayer> = []
  const slots: any[] = []
  let unregistered = 0

  const context: V2TuiContext = {
    theme: { text: { muted: "#808080" } },
    client: fakeV2Client(),
    keymap: { layer: (layer) => void layers.push(layer) },
    ui: {
      dialog: {
        select: async (options: any) => {
          selectCalls.push(options)
          return selects.shift() as any
        },
        prompt: async (options) => {
          promptCalls.push(options)
          return prompts.shift()
        },
      },
      toast: { show: (toast) => void toasts.push(toast) },
      router: { current: () => input.route },
      slot: (claim) => {
        slots.push(claim)
        return () => {
          unregistered++
        }
      },
    },
  }
  return { context, selectCalls, promptCalls, toasts, layers, slots, unregistered: () => unregistered }
}

function seedSession(host: FakeSessionHostAdapter, id: string, directory: string, title = id) {
  host.sessions.push({ id, title, directory, projectId: "p", path: "", timeUpdated: 1 })
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 20))

describe("SessionTransferV2TuiAdapter", () => {
  it("registers /transfer-session from an app slot render (in-tree keymap layer)", async () => {
    const { host, services } = makeServices()
    seedSession(host, "ses_abc", "C:\\work\\alpha")
    const adapter = new SessionTransferV2TuiAdapter(services)
    const ctx = makeContext({ route: { type: "session", sessionID: "ses_abc" } })

    const unregister = adapter.register(ctx.context)

    expect(ctx.slots.length).toBe(1)
    expect(ctx.slots[0].append).toBe("app")
    expect(ctx.layers.length).toBe(0)
    expect(ctx.slots[0].render()).toBeNull()
    expect(ctx.layers.length).toBe(1)

    const layer = ctx.layers[0]!()
    expect(layer.mode).toBe("global")
    expect(layer.commands.length).toBe(1)
    const command = layer.commands[0]!
    expect(command.id).toBe("session.transfer")
    expect(command.palette).toBe(true)
    expect(command.slash).toEqual({ name: "transfer-session", aliases: ["relocate"] })

    command.run()
    await tick()
    expect(ctx.selectCalls.length).toBe(1)

    unregister()
    expect(ctx.unregistered()).toBe(1)
  })

  it("moves the open session to a picked directory from another project", async () => {
    const { host, fs, services } = makeServices()
    host.directories = ["C:\\repo-b", "C:\\repo-a"]
    const ctx = makeContext({ route: { type: "session", sessionID: "ses_abc" }, selects: ["C:\\repo-b"] })

    await new SessionTransferV2TuiAdapter(services).open(ctx.context)

    expect(ctx.selectCalls.length).toBe(1)
    expect(ctx.selectCalls[0].title).toContain("ses_abc")
    expect(ctx.selectCalls[0].options[0]).toEqual({ title: "Enter custom path…", value: CUSTOM, category: "Directories" })
    expect(ctx.selectCalls[0].options.map((option: any) => option.value)).toEqual([CUSTOM, "C:\\repo-a", "C:\\repo-b"])
    expect(ctx.selectCalls[0].options[1].description).toBe("C:\\repo-a")
    expect(fs.ensured).toEqual(["C:\\repo-b"])
    expect(host.moves).toEqual([{ sessionId: "ses_abc", directory: "C:\\repo-b" }])
    expect(ctx.toasts).toEqual([
      { variant: "success", title: "Session transferred", message: "Moved to C:\\repo-b", duration: 4000 },
    ])
  })

  it("asks for a session first when no session is open", async () => {
    const { host, services } = makeServices()
    seedSession(host, "ses_home_1", "C:\\work\\one", "One")
    seedSession(host, "ses_home_2", "C:\\work\\two", "")
    host.directories = ["C:\\work\\one"]
    const ctx = makeContext({ route: { type: "home" }, selects: ["ses_home_2", "C:\\work\\one"] })

    await new SessionTransferV2TuiAdapter(services).open(ctx.context)

    expect(ctx.selectCalls.length).toBe(2)
    expect(ctx.selectCalls[0].options).toEqual([
      { title: "One", value: "ses_home_1", description: "C:\\work\\one", footer: "ses_home_1".slice(-8) },
      { title: "ses_home_2", value: "ses_home_2", description: "C:\\work\\two", footer: "ses_home_2".slice(-8) },
    ])
    expect(host.moves).toEqual([{ sessionId: "ses_home_2", directory: "C:\\work\\one" }])
  })

  it("warns when there are no sessions to transfer", async () => {
    const { services } = makeServices()
    const ctx = makeContext({ route: { type: "home" } })

    await new SessionTransferV2TuiAdapter(services).open(ctx.context)

    expect(ctx.selectCalls.length).toBe(0)
    expect(ctx.toasts).toEqual([{ variant: "warning", title: "Transfer session", message: "No sessions found." }])
  })

  it("stops when the session picker is dismissed", async () => {
    const { host, services } = makeServices()
    seedSession(host, "ses_1", "C:\\a")
    const ctx = makeContext({ route: { type: "home" }, selects: [undefined] })

    await new SessionTransferV2TuiAdapter(services).open(ctx.context)

    expect(ctx.selectCalls.length).toBe(1)
    expect(host.moves).toEqual([])
  })

  it("stops when the directory picker is dismissed", async () => {
    const { host, services } = makeServices()
    const ctx = makeContext({ route: { type: "session", sessionID: "ses_1" }, selects: [undefined] })

    await new SessionTransferV2TuiAdapter(services).open(ctx.context)

    expect(host.moves).toEqual([])
    expect(ctx.toasts).toEqual([])
  })

  it("moves to a free-form custom path, expanding ~", async () => {
    const { host, fs, services } = makeServices()
    const ctx = makeContext({
      route: { type: "session", sessionID: "ses_1" },
      selects: [CUSTOM],
      prompts: ["  ~/brand-new/folder  "],
    })

    await new SessionTransferV2TuiAdapter(services).open(ctx.context)

    const expected = path.join(os.homedir(), "brand-new/folder")
    expect(ctx.promptCalls.length).toBe(1)
    expect(ctx.promptCalls[0].title).toBe("Enter destination directory")
    expect(fs.ensured).toEqual([expected])
    expect(host.moves).toEqual([{ sessionId: "ses_1", directory: expected }])
  })

  it("stops when the custom path prompt is cancelled", async () => {
    const { host, services } = makeServices()
    const ctx = makeContext({ route: { type: "session", sessionID: "ses_1" }, selects: [CUSTOM], prompts: [undefined] })

    await new SessionTransferV2TuiAdapter(services).open(ctx.context)

    expect(host.moves).toEqual([])
    expect(ctx.toasts).toEqual([])
  })

  it("rejects an empty custom path through the use case's validation", async () => {
    const { host, services } = makeServices()
    const ctx = makeContext({ route: { type: "session", sessionID: "ses_1" }, selects: [CUSTOM], prompts: ["   "] })

    await new SessionTransferV2TuiAdapter(services).open(ctx.context)

    expect(host.moves).toEqual([])
    expect(ctx.toasts).toEqual([
      { variant: "error", title: "Transfer failed", message: 'Invalid directory "   ": Directory path cannot be empty' },
    ])
  })

  it("reports a failed host move", async () => {
    const { host, services } = makeServices()
    host.directories = ["C:\\gone"]
    host.moveError = new Error("Directory is unavailable: C:\\gone")
    const ctx = makeContext({ route: { type: "session", sessionID: "ses_1" }, selects: ["C:\\gone"] })

    await new SessionTransferV2TuiAdapter(services).open(ctx.context)

    expect(ctx.toasts).toEqual([
      { variant: "error", title: "Transfer failed", message: "Directory is unavailable: C:\\gone" },
    ])
  })

  it("reports unexpected failures, including non-Error values", async () => {
    const { host, services } = makeServices()
    host.listSessions = async () => {
      throw "host offline"
    }
    const ctx = makeContext({ route: { type: "home" } })

    await new SessionTransferV2TuiAdapter(services).open(ctx.context)

    expect(ctx.toasts).toEqual([{ variant: "error", title: "Transfer session", message: "host offline" }])
  })
})
