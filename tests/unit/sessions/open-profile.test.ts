import { describe, expect, it } from "bun:test"
import { CatalogProfileUseCase } from "@session-manager/application/CatalogProfileUseCase"
import { OpenProfileUseCase } from "@session-manager/application/OpenProfileUseCase"
import { DatabaseNotFoundError } from "@session-manager/domain/errors/DatabaseNotFoundError"
import { ProfileUnreadableError } from "@session-manager/domain/errors/ProfileUnreadableError"
import type { StoredSession } from "@session-manager/domain/model/SessionCatalog"
import { createBrowser } from "@session-manager/domain/model/Browser"
import { BrowseCliAdapter } from "@session-manager/infrastructure/adapters/inbound/cli/BrowseCliAdapter"
import { FakeFileSystem } from "@test/support/maintenance/fakes/file-system"
import { FakeOutput } from "@test/support/maintenance/fakes/output"
import { FakeRuntime } from "@test/support/maintenance/fakes/runtime"
import { opened } from "@test/support/sessions/catalogs"

const SNAPSHOT = "/tmp/opencode/session-manager-2026-09-27-00-00-00-win"
const stored: StoredSession = {
  id: "ses_a",
  generation: "v2",
  projectId: "p",
  parentId: null,
  forkOf: null,
  title: "t",
  directory: "/w",
  timeCreated: 0,
  timeUpdated: 1,
  timeArchived: null,
  entries: 1,
}

/** Reading fails for any path listed in `unreadable`; everything else reads one session. */
function setup(unreadable: readonly string[], options: { failCopy?: boolean; crash?: boolean } = {}) {
  const files = new FakeFileSystem()
  const runtime = new FakeRuntime()
  runtime.temporary = "/tmp"
  const read = (path: string) => {
    if (options.crash) throw new RangeError("not a store problem")
    if (unreadable.includes(path)) throw new Error("disk I/O error")
  }
  const catalog = new CatalogProfileUseCase(
    { sessions: (path) => (read(path), [stored]) },
    { summary: (path) => (read(path), { available: true, schemaVersion: 91, sessions: {} }), formatVersion: () => 91 },
    files,
  )
  if (options.failCopy) files.copyFile = () => {
    throw new Error("EACCES: copy refused")
  }
  return { files, useCase: new OpenProfileUseCase(catalog, files, runtime) }
}

describe("OpenProfileUseCase", () => {
  it("reads a readable profile in place, and close has nothing to remove", () => {
    const { files, useCase } = setup([])
    files.add("/win/opencode/opencode.db")
    const profile = useCase.open("win", "/win")
    expect(profile.snapshot).toBeNull()
    expect(profile.catalog.sessions.map((session) => session.id)).toEqual(["ses_a"])
    useCase.close(profile)
    expect(files.has("/win/opencode/opencode.db")).toBe(true)
  })

  it("reads an unreadable profile from a snapshot of both stores and their sidecars, and close removes it", () => {
    const { files, useCase } = setup(["/win/opencode/opencode.db"])
    for (const file of ["opencode/opencode.db", "opencode/opencode.db-wal", "cortexkit/magic-context/context.db", "cortexkit/magic-context/context.db-shm"])
      files.add(`/win/${file}`, file)
    const profile = useCase.open("win", "/win")
    expect(profile.snapshot).toBe(SNAPSHOT)
    expect(profile.catalog.profile.opencodeDb).toBe("/win/opencode/opencode.db")
    expect(profile.catalog.magicContext).toEqual({ available: true, schemaVersion: 91 })
    expect(files.has(`${SNAPSHOT}/opencode/opencode.db-wal`)).toBe(true)
    expect(files.has(`${SNAPSHOT}/cortexkit/magic-context/context.db-shm`)).toBe(true)
    expect(files.has(`${SNAPSHOT}/opencode/opencode.db-shm`)).toBe(false)
    useCase.close(profile)
    expect(files.has(`${SNAPSHOT}/opencode/opencode.db`)).toBe(false)
  })

  it("snapshots a profile whose Magic Context store is absent", () => {
    const { files, useCase } = setup(["/win/opencode/opencode.db"])
    files.add("/win/opencode/opencode.db")
    expect(useCase.open("win", "/win").catalog.magicContext.available).toBe(false)
  })

  it("names the original store when the copy is unreadable too, and removes the snapshot", () => {
    const { files, useCase } = setup(["/win/opencode/opencode.db", `${SNAPSHOT}/opencode/opencode.db`])
    files.add("/win/opencode/opencode.db")
    expect(() => useCase.open("win", "/win")).toThrow(new ProfileUnreadableError("/win/opencode/opencode.db", "disk I/O error"))
    expect(files.has(`${SNAPSHOT}/opencode/opencode.db`)).toBe(false)
  })

  it("passes on a failed copy, a missing store and any other error", () => {
    const copy = setup(["/win/opencode/opencode.db"], { failCopy: true })
    copy.files.add("/win/opencode/opencode.db")
    expect(() => copy.useCase.open("win", "/win")).toThrow("EACCES: copy refused")
    expect(() => setup([]).useCase.open("win", "/nowhere")).toThrow(DatabaseNotFoundError)
    const crash = setup([], { crash: true })
    crash.files.add("/win/opencode/opencode.db")
    expect(() => crash.useCase.open("win", "/win")).toThrow(new ProfileUnreadableError("/win/opencode/opencode.db", "not a store problem"))
  })
})

describe("BrowseCliAdapter", () => {
  function cli(failRight = false) {
    const output = new FakeOutput()
    const runtime = new FakeRuntime()
    runtime.home = "/home/me"
    const events: string[] = []
    const shown: unknown[] = []
    const adapter = new BrowseCliAdapter({
      profiles: {
        open: (name, dataHome) => {
          events.push(`open ${name} ${dataHome}`)
          if (failRight && name === "right") throw new Error("right is broken")
          return opened(name, [])
        },
        close: (profile) => {
          events.push(`close ${profile.catalog.profile.name}`)
        },
      },
      output,
      runtime,
      environment: {},
      show: async (initial) => {
        shown.push(initial)
        events.push("shown")
      },
    })
    return { adapter, output, events, shown }
  }

  it("shows this machine's profile, or two named profiles, and closes them after the browser quits", async () => {
    const one = cli()
    expect(await one.adapter.run([])).toBe(0)
    expect(one.events).toEqual(["open left /home/me/.local/share", "shown", "close left"])
    expect(one.shown[0]).toEqual(createBrowser(opened("left", []), null, 1))
    const two = cli()
    expect(await two.adapter.run(["--right", "/r", "--left", "/l"])).toBe(0)
    expect(two.events).toEqual(["open left /l", "open right /r", "shown", "close left", "close right"])
  })

  it("closes what it opened when a profile fails, and prints the usage for unknown arguments", async () => {
    const broken = cli(true)
    await expect(broken.adapter.run(["--right", "/r"])).rejects.toThrow("right is broken")
    expect(broken.events).toEqual(["open left /home/me/.local/share", "open right /r", "close left"])
    for (const argv of [["--left"], ["--left", "--right"], ["--top", "/x"]]) {
      const { adapter, output, events } = cli()
      expect(await adapter.run(argv)).toBe(2)
      expect(output.lines).toEqual(["usage: opencode-session-manager tui [--left <dataHome>] [--right <dataHome>]"])
      expect(events).toEqual([])
    }
  })
})
