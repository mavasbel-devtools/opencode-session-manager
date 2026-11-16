import { describe, it, expect } from "bun:test"
import {
  SessionTransferV2TuiAdapter,
  type V2TransferServices,
} from "@session-manager/infrastructure/adapters/inbound/tui/SessionTransferV2TuiAdapter"
import { InvalidMapRuleError } from "@session-manager/domain/errors/InvalidMapRuleError"
import { SessionLocationRepairV2TuiAdapter } from "@session-manager/infrastructure/adapters/inbound/tui/SessionLocationRepairV2TuiAdapter"
import type { LocationRepairReport } from "@session-manager/domain/model/LocationRepair"
import type { RepairSessionLocationsPort } from "@session-manager/domain/ports/inbound/RepairSessionLocationsPort"
import type { V2KeymapLayer, V2TuiContext } from "@session-manager/infrastructure/host/V2TuiContext"
import { fakeV2Client } from "@test/support/fakes/hosts"
import { MoveSessionUseCase } from "@session-manager/application/MoveSessionUseCase"
import { BuildDirectoryOptionsUseCase } from "@session-manager/application/BuildDirectoryOptionsUseCase"
import type { FolderBrowserRequest } from "@session-manager/infrastructure/adapters/inbound/tui/FolderBrowserDialogV2Adapter"
import {
  FakeDirectoryListingAdapter,
  FakeFileSystemAdapter,
  FakeHomeDirectoryAdapter,
  FakeSessionHostAdapter,
} from "@test/support/fakes/transfer-ports"

function makeServices(folders: Array<string | undefined> = [], repairSession: RepairSessionLocationsPort = { execute: async () => ({ rules: [], repaired: [], skipped: [], worktrees: [], busy: false }) }) {
  const host = new FakeSessionHostAdapter()
  const fs = new FakeFileSystemAdapter()
  const listing = new FakeDirectoryListingAdapter()
  const picks: FolderBrowserRequest[] = []
  const services: V2TransferServices = {
    host,
    home: new FakeHomeDirectoryAdapter(),
    moveSession: new MoveSessionUseCase(host, fs),
    repairSession,
    buildDirectoryOptions: new BuildDirectoryOptionsUseCase(host, fs, listing),
    folders: {
      pick: async (_context, request) => {
        picks.push(request)
        return folders.shift()
      },
    },
  }
  return { host, fs, listing, picks, services }
}

function makeContext(input: { route: { type: string; sessionID?: string }; selects?: unknown[] }) {
  const selects = [...(input.selects ?? [])]
  const selectCalls: any[] = []
  const toasts: any[] = []
  const layers: Array<() => V2KeymapLayer> = []
  const slots: any[] = []
  let unregistered = 0

  const context: V2TuiContext = {
    theme: { text: { muted: "#808080" } },
    client: fakeV2Client(),
    data: { session: { get: () => undefined } },
    keymap: { layer: (layer) => void layers.push(layer) },
    ui: {
      dialog: {
        show: () => undefined,
        set: () => undefined,
        clear: () => undefined,
        select: async (options: any) => {
          selectCalls.push(options)
          return selects.shift() as any
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
  return { context, selectCalls, toasts, layers, slots, unregistered: () => unregistered }
}

function seedSession(host: FakeSessionHostAdapter, id: string, directory: string, title = id) {
  host.sessions.push({ id, title, directory, projectId: "p", path: "", timeUpdated: 1 })
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 20))

class FakeRepairPort implements RepairSessionLocationsPort {
  public reports: LocationRepairReport[] = []
  public failure: unknown
  public calls = 0

  async execute(): Promise<LocationRepairReport> {
    this.calls++
    if (this.failure !== undefined) throw this.failure
    return this.reports.shift() ?? { rules: [], repaired: [], skipped: [], worktrees: [], busy: false }
  }
}

describe("SessionTransferV2TuiAdapter", () => {
  it("registers /transfer-session (no alias, no description) from an app slot render (in-tree keymap layer)", async () => {
    const { host, services, picks } = makeServices()
    seedSession(host, "ses_abc", "/work/alpha")
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
    expect(layer.commands).toEqual([
      { id: "session.transfer", title: "Transfer session", group: "Session", palette: true, slash: { name: "transfer-session" }, run: expect.any(Function) },
    ])

    layer.commands[0]!.run()
    await tick()
    expect(picks.length).toBe(1)

    unregister()
    expect(ctx.unregistered()).toBe(1)
  })

  it("opens the folder browser over the known folders that exist, then moves the open session to the chosen one", async () => {
    const { host, fs, listing, picks, services } = makeServices(["/repo-b"])
    host.directories = ["/repo-b", "/gone", "/", "/home/user/repo-a"]
    listing.add("/repo-b")
    listing.add("/home/user/repo-a")
    const ctx = makeContext({ route: { type: "session", sessionID: "ses_abc" } })

    await new SessionTransferV2TuiAdapter(services).open(ctx.context)

    expect(picks).toEqual([{ title: "Transfer session (ses_abc)", home: "/home/user", roots: ["/home/user/repo-a", "/repo-b"] }])
    expect(fs.ensured).toEqual(["/repo-b"])
    expect(host.moves).toEqual([{ sessionId: "ses_abc", directory: "/repo-b" }])
    expect(ctx.toasts).toEqual([{ variant: "success", title: "Session transferred", message: "Moved to /repo-b", duration: 4000 }])
  })

  it("repairs only the selected stale session before offering its intentional destination", async () => {
    const repair = new FakeRepairPort()
    repair.reports.push({ rules: [{ from: "/old", to: "/new" }], repaired: [{ session_id: "ses_abc", from_directory: "/old/project", to_directory: "/new/project" }], skipped: [], worktrees: [], busy: false })
    const { host, services } = makeServices(["/chosen"], repair)
    const ctx = makeContext({ route: { type: "session", sessionID: "ses_abc" } })

    await new SessionTransferV2TuiAdapter(services).open(ctx.context)

    expect([repair.calls, host.moves, ctx.toasts]).toEqual([
      1,
      [{ sessionId: "ses_abc", directory: "/chosen" }],
      [
        { variant: "info", title: "Transfer session", message: "Repaired stale location to /new/project.", duration: 4000 },
        { variant: "success", title: "Session transferred", message: "Moved to /chosen", duration: 4000 },
      ],
    ])
  })

  it("continues with an intentional transfer when selected-session repair is unavailable", async () => {
    const repair = new FakeRepairPort()
    repair.failure = "mapping configuration unavailable"
    const { host, services } = makeServices(["/chosen"], repair)
    const ctx = makeContext({ route: { type: "session", sessionID: "ses_abc" } })

    await new SessionTransferV2TuiAdapter(services).open(ctx.context)

    expect([repair.calls, host.moves, ctx.toasts]).toEqual([
      1,
      [{ sessionId: "ses_abc", directory: "/chosen" }],
      [
        { variant: "warning", title: "Transfer session", message: "Location repair skipped: mapping configuration unavailable", duration: 5000 },
        { variant: "success", title: "Session transferred", message: "Moved to /chosen", duration: 4000 },
      ],
    ])
  })

  it("warns but still transfers when the selected session's repair is busy, has a missing target, or an unresolved work tree", async () => {
    const rules = [{ from: "/old", to: "/new" }]
    const cases: Array<[LocationRepairReport, string]> = [
      [{ rules, repaired: [], skipped: [], worktrees: [], busy: true }, "Location repair skipped: another OpenCode window is repairing session locations."],
      [
        { rules, repaired: [], skipped: [{ session_id: "ses_abc", directory: "/old/p", reason: "target-missing", to_directory: "/new/p" }], worktrees: [], busy: false },
        "Location repair skipped: the mapped folder /new/p is missing.",
      ],
      [
        { rules, repaired: [], skipped: [{ session_id: "ses_abc", directory: "/old/p", reason: "worktree-unresolved", to_directory: "/new/p" }], worktrees: [], busy: false },
        "Location repair skipped: Git cannot resolve the work tree of /new/p.",
      ],
    ]
    for (const [report, message] of cases) {
      const repair = new FakeRepairPort()
      repair.reports.push(report)
      const { host, services } = makeServices(["/chosen"], repair)
      const ctx = makeContext({ route: { type: "session", sessionID: "ses_abc" } })
      await new SessionTransferV2TuiAdapter(services).open(ctx.context)
      expect([host.moves, ctx.toasts[0]]).toEqual([[{ sessionId: "ses_abc", directory: "/chosen" }], { variant: "warning", title: "Transfer session", message, duration: 5000 }])
    }
  })

  it("stays quiet before a transfer when the selected session needed no repair", async () => {
    const repair = new FakeRepairPort()
    repair.reports.push({
      rules: [{ from: "/old", to: "/new" }],
      repaired: [],
      skipped: [{ session_id: "ses_abc", directory: "/work/p", reason: "directory-present", to_directory: null }],
      worktrees: [],
      busy: false,
    })
    const { services } = makeServices(["/chosen"], repair)
    const ctx = makeContext({ route: { type: "session", sessionID: "ses_abc" } })
    await new SessionTransferV2TuiAdapter(services).open(ctx.context)
    expect(ctx.toasts).toEqual([{ variant: "success", title: "Session transferred", message: "Moved to /chosen", duration: 4000 }])
  })

  it("asks for a session first when no session is open, showing folders under the home as ~", async () => {
    const { host, services } = makeServices(["/work/one"])
    seedSession(host, "ses_home_1", "/home/user/one", "One")
    seedSession(host, "ses_home_2", "/work/two", "")
    const ctx = makeContext({ route: { type: "home" }, selects: ["ses_home_2"] })

    await new SessionTransferV2TuiAdapter(services).open(ctx.context)

    expect(ctx.selectCalls.length).toBe(1)
    expect(ctx.selectCalls[0].options).toEqual([
      { title: "One", value: "ses_home_1", description: "~/one", footer: "ses_home_1".slice(-8) },
      { title: "ses_home_2", value: "ses_home_2", description: "/work/two", footer: "ses_home_2".slice(-8) },
    ])
    expect(host.moves).toEqual([{ sessionId: "ses_home_2", directory: "/work/one" }])
  })

  it("warns when there are no sessions to transfer", async () => {
    const { services, picks } = makeServices()
    const ctx = makeContext({ route: { type: "home" } })

    await new SessionTransferV2TuiAdapter(services).open(ctx.context)

    expect([ctx.selectCalls.length, picks.length]).toEqual([0, 0])
    expect(ctx.toasts).toEqual([{ variant: "warning", title: "Transfer session", message: "No sessions found." }])
  })

  it("stops when the session picker is dismissed", async () => {
    const { host, services, picks } = makeServices()
    seedSession(host, "ses_1", "/a")
    const ctx = makeContext({ route: { type: "home" }, selects: [undefined] })

    await new SessionTransferV2TuiAdapter(services).open(ctx.context)

    expect([ctx.selectCalls.length, picks.length, host.moves]).toEqual([1, 0, []])
  })

  it("stops when the folder browser is closed", async () => {
    const { host, services } = makeServices([undefined])
    const ctx = makeContext({ route: { type: "session", sessionID: "ses_1" } })

    await new SessionTransferV2TuiAdapter(services).open(ctx.context)

    expect([host.moves, ctx.toasts]).toEqual([[], []])
  })

  it("reports a failed host move", async () => {
    const { host, services } = makeServices(["/gone"])
    host.moveError = new Error("Directory is unavailable: /gone")
    const ctx = makeContext({ route: { type: "session", sessionID: "ses_1" } })

    await new SessionTransferV2TuiAdapter(services).open(ctx.context)

    expect(ctx.toasts).toEqual([{ variant: "error", title: "Transfer failed", message: "Directory is unavailable: /gone" }])
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

describe("SessionLocationRepairV2TuiAdapter", () => {
  it("runs one quiet startup repair and exposes /repair-sessions from an app slot", async () => {
    const repair = new FakeRepairPort()
    const ctx = makeContext({ route: { type: "home" } })
    const unregister = new SessionLocationRepairV2TuiAdapter(repair).register(ctx.context)

    await tick()
    expect([repair.calls, ctx.toasts, ctx.slots[0]!.append]).toEqual([1, [], "app"])
    expect(ctx.slots[0]!.render()).toBeNull()
    const command = ctx.layers[0]!().commands[0]!
    expect(command).toEqual({ id: "session.repair-locations", title: "Repair session locations", group: "Session", palette: true, slash: { name: "repair-sessions" }, run: expect.any(Function) })
    command.run()
    await tick()
    expect(ctx.toasts).toEqual([{ variant: "info", title: "Repair session locations", message: "No location-repair mappings are configured.", duration: 5000 }])
    unregister()
    expect(ctx.unregistered()).toBe(1)
  })

  it("reports repairs, mapped no-ops, and an explicit command failure", async () => {
    const repair = new FakeRepairPort()
    repair.reports.push(
      { rules: [{ from: "/old", to: "/new" }], repaired: [{ session_id: "ses_a", from_directory: "/old/a", to_directory: "/new/a" }], skipped: [], worktrees: [], busy: false },
      { rules: [{ from: "/old", to: "/new" }], repaired: [], skipped: [], worktrees: [], busy: false },
    )
    const ctx = makeContext({ route: { type: "home" } })
    new SessionLocationRepairV2TuiAdapter(repair).register(ctx.context)
    await tick()
    expect(ctx.toasts).toEqual([{ variant: "success", title: "Repair session locations", message: "Repaired 1 session location.", duration: 5000 }])
    ctx.slots[0]!.render()
    const command = ctx.layers[0]!().commands[0]!
    command.run()
    await tick()
    expect(ctx.toasts[1]).toEqual({ variant: "info", title: "Repair session locations", message: "No stale mapped session locations needed repair.", duration: 5000 })
    repair.failure = "server unavailable"
    command.run()
    await tick()
    expect(ctx.toasts[2]).toEqual({ variant: "error", title: "Repair session locations", message: "server unavailable" })
  })

  it("shows a startup change and a configuration error, but keeps a busy lock or host failure at startup quiet", async () => {
    const rules = [{ from: "/old", to: "/new" }]
    const tree = { directory: "/new/wt", root: "/new/wt", status: "repaired" as const, command: { cwd: "/new/wt", paths: [] } }
    const startup = async (outcome: LocationRepairReport | Error) => {
      const repair = new FakeRepairPort()
      if (outcome instanceof Error) repair.failure = outcome
      else repair.reports.push(outcome)
      const ctx = makeContext({ route: { type: "home" } })
      new SessionLocationRepairV2TuiAdapter(repair).register(ctx.context)
      await tick()
      return ctx.toasts
    }
    expect(await startup({ rules, repaired: [], skipped: [], worktrees: [tree], busy: false })).toEqual([
      { variant: "success", title: "Repair session locations", message: "No stale mapped session locations needed repair. Repaired Git links of 1 work tree.", duration: 5000 },
    ])
    expect(await startup({ rules, repaired: [], skipped: [], worktrees: [], busy: true })).toEqual([])
    expect(await startup(new Error("connection reset"))).toEqual([])
    expect(await startup(new InvalidMapRuleError("/cfg", "location_repair maps must not overlap"))).toEqual([
      { variant: "error", title: "Repair session locations", message: "Location-repair configuration is invalid: --map /cfg: location_repair maps must not overlap", duration: 8000 },
    ])
  })

  it("on request reports a busy lock and sessions left for attention", async () => {
    const rules = [{ from: "/old", to: "/new" }]
    const repair = new FakeRepairPort()
    const ctx = makeContext({ route: { type: "home" } })
    new SessionLocationRepairV2TuiAdapter(repair).register(ctx.context)
    await tick()
    ctx.slots[0]!.render()
    const command = ctx.layers[0]!().commands[0]!
    repair.reports.push(
      { rules, repaired: [], skipped: [], worktrees: [], busy: true },
      {
        rules,
        repaired: [{ session_id: "a", from_directory: "/old/a", to_directory: "/new/a" }],
        skipped: [{ session_id: "b", directory: "/old/b", reason: "worktree-unresolved", to_directory: "/new/b" }],
        worktrees: [],
        busy: false,
      },
    )
    command.run()
    await tick()
    command.run()
    await tick()
    expect(ctx.toasts).toEqual([
      { variant: "info", title: "Repair session locations", message: "Another OpenCode window is repairing session locations; nothing was changed.", duration: 5000 },
      { variant: "warning", title: "Repair session locations", message: "Repaired 1 session location. 1 session left: Git cannot resolve the mapped work tree.", duration: 5000 },
    ])
  })
})
