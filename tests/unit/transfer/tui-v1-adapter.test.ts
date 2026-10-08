import { describe, it, expect } from "bun:test"
import {
  SessionTransferV1TuiAdapter,
  type V1TransferServices,
} from "@session-manager/infrastructure/adapters/inbound/tui/SessionTransferV1TuiAdapter"
import {
  FakeSessionDbAdapter,
  FakeProjectResolverAdapter,
  FakeFileSystemAdapter,
} from "@test/support/fakes/transfer-ports"
import { TransferSessionUseCase } from "@session-manager/application/TransferSessionUseCase"
import { BuildDirectoryOptionsUseCase } from "@session-manager/application/BuildDirectoryOptionsUseCase"

const CUSTOM = "__transfer_custom_path__"

function makeContainer() {
  const db = new FakeSessionDbAdapter()
  const resolver = new FakeProjectResolverAdapter()
  const fs = new FakeFileSystemAdapter()
  const container: V1TransferServices = {
    db,
    fs,
    transferSession: new TransferSessionUseCase(db, resolver, fs),
    buildDirectoryOptions: new BuildDirectoryOptionsUseCase(db, fs),
  }
  return { db, fs, container }
}

function seed(db: FakeSessionDbAdapter, id: string, directory: string) {
  db.sessions.set(id, { id, title: id, directory, projectId: "p", path: "", timeUpdated: 1 })
}

type Api = {
  api: any
  toasts: any[]
  prompts: any[]
  dialogs: any[]
  cleared: () => number
}

function makeApi(input: {
  route: any
  container: V1TransferServices
  promptAsync?: (input: any) => Promise<unknown>
}): Api {
  const toasts: any[] = []
  const prompts: any[] = []
  const dialogs: any[] = []
  let clearCount = 0

  const api: any = {
    keymap: { registerLayer: (layer: any) => layer.commands[0].run() },
    route: input.route,
    client: {
      session: {
        promptAsync: (payload: any) => {
          prompts.push(payload)
          return (input.promptAsync ?? (() => Promise.resolve({})))(payload)
        },
      },
    },
    ui: {
      dialog: {
        replace: (render: () => any) => dialogs.push(render()),
        clear: () => {
          clearCount++
        },
      },
      DialogSelect: (props: any) => props,
      DialogPrompt: (props: any) => props,
      toast: (toast: any) => toasts.push(toast),
    },
  }

  return { api, toasts, prompts, dialogs, cleared: () => clearCount }
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 20))

describe("SessionTransferV1TuiAdapter", () => {
  it("registers the /transfer-session slash command", () => {
    const { container } = makeContainer()
    const adapter = new SessionTransferV1TuiAdapter(container)

    let commands: any[] = []
    adapter.register({ keymap: { registerLayer: (layer: any) => (commands = layer.commands) } } as any)

    expect(commands.length).toBe(1)
    expect(commands[0].name).toBe("session.transfer")
    expect(commands[0].slashName).toBe("transfer-session")
    expect(commands[0].slashAliases).toContain("relocate")
  })

  it("opens the directory picker with the custom-path entry first for an active session", async () => {
    const { db, container } = makeContainer()
    seed(db, "ses_abc", "C:\\work\\alpha")

    const adapter = new SessionTransferV1TuiAdapter(container)
    const { api, dialogs } = makeApi({ route: { current: { name: "session", params: { sessionID: "ses_abc" } } }, container })

    adapter.register(api)
    await tick()

    expect(dialogs.length).toBe(1)
    expect(dialogs[0].title).toContain("ses_abc")
    expect(dialogs[0].options[0].value).toBe(CUSTOM)
  })

  it("transfers and notifies the agent when a directory entry is selected", async () => {
    const { db, container } = makeContainer()
    seed(db, "ses_abc", "C:\\work\\alpha")

    const adapter = new SessionTransferV1TuiAdapter(container)
    const { api, toasts, prompts, dialogs } = makeApi({
      route: { current: { name: "session", params: { sessionID: "ses_abc" } } },
      container,
    })

    adapter.register(api)
    await tick()

    const entry = dialogs[0].options.find((option: any) => option.value === "C:\\work\\alpha")
    entry.onSelect()
    await tick()

    expect(prompts.length).toBe(1)
    expect(prompts[0].directory).toBe("C:\\work\\alpha")
    expect(prompts[0].noReply).toBe(true)
    expect(toasts.some((toast) => toast.variant === "success")).toBe(true)
  })

  it("lists sessions on the home view and moves into the directory picker on select", async () => {
    const { db, container } = makeContainer()
    seed(db, "ses_one", "C:\\work\\one")
    seed(db, "ses_two", "C:\\work\\two")

    const adapter = new SessionTransferV1TuiAdapter(container)
    const { api, dialogs } = makeApi({ route: { current: { name: "home" } }, container })

    adapter.register(api)
    await tick()

    expect(dialogs.length).toBe(1)
    expect(dialogs[0].options.length).toBe(2)

    dialogs[0].options[0].onSelect()
    await tick()

    expect(dialogs.length).toBe(2)
    expect(dialogs[1].title).toContain("ses_")
  })

  it("warns when no sessions exist on the home view", async () => {
    const { container } = makeContainer()
    const adapter = new SessionTransferV1TuiAdapter(container)
    const { api, toasts } = makeApi({ route: { current: { name: "home" } }, container })

    adapter.register(api)
    await tick()

    expect(toasts.length).toBe(1)
    expect(toasts[0].variant).toBe("warning")
  })

  it("shows an error toast when listing sessions fails", async () => {
    const { db, container } = makeContainer()
    db.listSessions = () => Promise.reject(new Error("db offline"))

    const adapter = new SessionTransferV1TuiAdapter(container)
    const { api, toasts } = makeApi({ route: { current: { name: "home" } }, container })

    adapter.register(api)
    await tick()

    expect(toasts[0].variant).toBe("error")
    expect(toasts[0].message).toContain("db offline")
  })

  it("opens the custom-path prompt from the sentinel entry", async () => {
    const { db, container } = makeContainer()
    seed(db, "ses_abc", "C:\\work\\alpha")

    const adapter = new SessionTransferV1TuiAdapter(container)
    const { api, dialogs } = makeApi({ route: { current: { name: "session", params: { sessionID: "ses_abc" } } }, container })

    adapter.register(api)
    await tick()

    const sentinel = dialogs[0].options.find((option: any) => option.value === CUSTOM)
    sentinel.onSelect()

    expect(dialogs.length).toBe(2)
    expect(dialogs[1].title).toBe("Enter destination directory")
  })

  it("rejects an empty custom path with an error toast", async () => {
    const { db, container } = makeContainer()
    seed(db, "ses_abc", "C:\\work\\alpha")

    const adapter = new SessionTransferV1TuiAdapter(container)
    const { api, toasts, prompts, dialogs } = makeApi({
      route: { current: { name: "session", params: { sessionID: "ses_abc" } } },
      container,
    })

    adapter.register(api)
    await tick()

    dialogs[0].options.find((option: any) => option.value === CUSTOM).onSelect()
    dialogs[1].onConfirm("   ")
    await tick()

    expect(prompts.length).toBe(0)
    expect(toasts.some((toast) => toast.variant === "error")).toBe(true)
  })

  it("transfers to a canonicalized custom path", async () => {
    const { db, container } = makeContainer()
    seed(db, "ses_abc", "C:\\work\\alpha")

    const adapter = new SessionTransferV1TuiAdapter(container)
    const { api, prompts, dialogs } = makeApi({
      route: { current: { name: "session", params: { sessionID: "ses_abc" } } },
      container,
    })

    adapter.register(api)
    await tick()

    dialogs[0].options.find((option: any) => option.value === CUSTOM).onSelect()
    dialogs[1].onConfirm("~/projects/beta")
    await tick()

    expect(prompts.length).toBe(1)
    expect(prompts[0].directory).toContain("beta")
  })

  it("clears the dialog when the custom-path prompt is cancelled", async () => {
    const { db, container } = makeContainer()
    seed(db, "ses_abc", "C:\\work\\alpha")

    const adapter = new SessionTransferV1TuiAdapter(container)
    const { api, dialogs, cleared } = makeApi({
      route: { current: { name: "session", params: { sessionID: "ses_abc" } } },
      container,
    })

    adapter.register(api)
    await tick()

    dialogs[0].options.find((option: any) => option.value === CUSTOM).onSelect()
    dialogs[1].onCancel()

    expect(cleared()).toBe(1)
  })

  it("still reports success when the agent notification fails", async () => {
    const { db, container } = makeContainer()
    seed(db, "ses_abc", "C:\\work\\alpha")

    const adapter = new SessionTransferV1TuiAdapter(container)
    const { api, toasts, dialogs } = makeApi({
      route: { current: { name: "session", params: { sessionID: "ses_abc" } } },
      container,
      promptAsync: () => Promise.reject(new Error("server down")),
    })

    adapter.register(api)
    await tick()

    dialogs[0].options.find((option: any) => option.value === "C:\\work\\alpha").onSelect()
    await tick()

    expect(toasts.some((toast) => toast.variant === "success")).toBe(true)
    expect(toasts.some((toast) => toast.variant === "error")).toBe(false)
  })

  it("reports a failure when the transfer itself fails", async () => {
    const { db, container } = makeContainer()
    seed(db, "ses_abc", "C:\\work\\alpha")
    container.transferSession.execute = () => Promise.reject(new Error("transfer exploded"))

    const adapter = new SessionTransferV1TuiAdapter(container)
    const { api, toasts, dialogs } = makeApi({
      route: { current: { name: "session", params: { sessionID: "ses_abc" } } },
      container,
    })

    adapter.register(api)
    await tick()

    dialogs[0].options.find((option: any) => option.value === "C:\\work\\alpha").onSelect()
    await tick()

    expect(toasts.some((toast) => toast.variant === "error" && toast.message.includes("transfer exploded"))).toBe(true)
  })

  it("shows an error toast when building directory options fails", async () => {
    const { db, container } = makeContainer()
    seed(db, "ses_abc", "C:\\work\\alpha")
    container.buildDirectoryOptions.execute = () => Promise.reject(new Error("scan failed"))

    const adapter = new SessionTransferV1TuiAdapter(container)
    const { api, toasts } = makeApi({
      route: { current: { name: "session", params: { sessionID: "ses_abc" } } },
      container,
    })

    adapter.register(api)
    await tick()

    expect(toasts[0].variant).toBe("error")
    expect(toasts[0].message).toContain("scan failed")
  })
})
