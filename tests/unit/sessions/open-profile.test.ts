import { describe, expect, it } from "bun:test"
import { CatalogProfileUseCase } from "@session-manager/application/CatalogProfileUseCase"
import { OpenProfileUseCase } from "@session-manager/application/OpenProfileUseCase"
import { DatabaseNotFoundError } from "@session-manager/domain/errors/DatabaseNotFoundError"
import { ProfileUnreadableError } from "@session-manager/domain/errors/ProfileUnreadableError"
import type { StoredSession } from "@session-manager/domain/model/SessionCatalog"
import { createBrowser } from "@session-manager/domain/model/Browser"
import { profileAt, profileOfFiles } from "@session-manager/domain/model/Profile"
import { BrowseCliAdapter, TUI_USAGE } from "@session-manager/infrastructure/adapters/inbound/cli/BrowseCliAdapter"
import { FakeFileSystem } from "@test/support/maintenance/fakes/file-system"
import { FakeOutput } from "@test/support/maintenance/fakes/output"
import { FakeRuntime } from "@test/support/maintenance/fakes/runtime"
import { ServerNotFoundError } from "@session-manager/domain/errors/ServerNotFoundError"
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
    { sessions: (path) => (read(path), [stored]), messageIds: () => [] },
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
    const profile = useCase.open(profileAt("win", "/win"))
    expect(profile.snapshot).toBeNull()
    expect(profile.catalog.sessions.map((session) => session.id)).toEqual(["ses_a"])
    useCase.close(profile)
    expect(files.has("/win/opencode/opencode.db")).toBe(true)
  })

  it("reads an unreadable profile from a snapshot of both stores and their sidecars, and close removes it", () => {
    const { files, useCase } = setup(["/win/opencode/opencode.db"])
    for (const file of ["opencode/opencode.db", "opencode/opencode.db-wal", "cortexkit/magic-context/context.db", "cortexkit/magic-context/context.db-shm"])
      files.add(`/win/${file}`, file)
    const profile = useCase.open(profileAt("win", "/win"))
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
    expect(useCase.open(profileAt("win", "/win")).catalog.magicContext.available).toBe(false)
  })

  it("names the original store when the copy is unreadable too, and removes the snapshot", () => {
    const { files, useCase } = setup(["/win/opencode/opencode.db", `${SNAPSHOT}/opencode/opencode.db`])
    files.add("/win/opencode/opencode.db")
    expect(() => useCase.open(profileAt("win", "/win"))).toThrow(new ProfileUnreadableError("/win/opencode/opencode.db", "disk I/O error"))
    expect(files.has(`${SNAPSHOT}/opencode/opencode.db`)).toBe(false)
  })

  it("passes on a failed copy, a missing store and any other error", () => {
    const copy = setup(["/win/opencode/opencode.db"], { failCopy: true })
    copy.files.add("/win/opencode/opencode.db")
    expect(() => copy.useCase.open(profileAt("win", "/win"))).toThrow("EACCES: copy refused")
    expect(() => setup([]).useCase.open(profileAt("win", "/nowhere"))).toThrow(DatabaseNotFoundError)
    const crash = setup([], { crash: true })
    crash.files.add("/win/opencode/opencode.db")
    expect(() => crash.useCase.open(profileAt("win", "/win"))).toThrow(new ProfileUnreadableError("/win/opencode/opencode.db", "not a store problem"))
  })
})

describe("profileOfFiles", () => {
  it("names a profile by its store files, its folder standing for the data home", () => {
    expect(profileOfFiles("left", "/data/x/opencode.db", "/data/c.db")).toEqual({
      name: "left",
      dataHome: "/data/x",
      opencodeDb: "/data/x/opencode.db",
      contextDb: "/data/c.db",
    })
    expect(profileOfFiles("left", "C:\\data\\opencode.db", undefined)).toMatchObject({ dataHome: "C:\\data", contextDb: "" })
    expect(profileOfFiles("left", "/opencode.db", undefined).dataHome).toBe("/")
    expect(profileOfFiles("left", "opencode.db", undefined).dataHome).toBe(".")
  })
})

describe("BrowseCliAdapter", () => {
  function cli(failRight = false, rebuilds: ReadonlyArray<readonly ["left" | "right", string[]]> = [], environment: { XDG_DATA_HOME?: string } = {}) {
    const output = new FakeOutput()
    const runtime = new FakeRuntime()
    runtime.home = "/home/me"
    const events: string[] = []
    const shown: unknown[] = []
    const adapter = new BrowseCliAdapter({
      profiles: {
        open: (profile) => {
          events.push(`open ${profile.name} ${profile.opencodeDb} ${profile.contextDb}`)
          if (failRight && profile.name === "right") throw new Error("right is broken")
          return opened(profile.name, [])
        },
        close: (profile) => {
          events.push(`close ${profile.catalog.profile.name}`)
        },
      },
      output,
      runtime,
      environment,
      apply: {
        apply: (input) => {
          events.push(`apply ${input.left.catalog.profile.name} ${input.right.catalog.profile.name} ${input.queue.length} ${input.scope} ${JSON.stringify(input.maps)}`)
          return input.dryRun
            ? { result: ["checked"], changed: false, planned: {} }
            : { result: ["done"], changed: true, planned: {}, right: opened("right", [], { snapshot: "/fresh" }) }
        },
      },
      verify: {
        verify: (input) => {
          events.push(`verify ${input.opencodeDb.split("/")[2]} ${input.readableOpencodeDb ?? input.opencodeDb} ${input.sessions} ${input.behind}`)
          return {
            opencode_db: input.opencodeDb,
            context_db: null,
            magic_context_format: null,
            checks: { opencode: { integrity_ok: true, foreign_keys_ok: true }, context: null },
            sessions_checked: 0,
            sessions: [],
            findings: [],
            counts: { error: 0, warning: 0, info: 0 },
            ok: true,
          }
        },
      },
      rebuild: {
        rebuild: async (input) => {
          events.push(`rebuild ${input.command} ${input.contextDb} ${input.sessions.join(",")} ${input.wait}`)
          input.onProgress?.({ session_id: input.sessions[0]!, snapshot: { summaries: 1, reach: 2, wrapup: "running", leased: false, staged: 0, runs: [] }, elapsed_ms: 1000 })
          if (input.sessions.includes("ses_boom")) throw new ServerNotFoundError("/state/service.json")
          if (input.sessions.includes("ses_text")) throw "plain"
          return { server: "http://s", context_db: input.contextDb, command: input.command, sessions: [], ok: true }
        },
      },
      versions: {
        local: () => ({ pinned: "0.47.0", loaded: "0.47.0", latest: null }),
        withLatest: async (local) => {
          events.push("npm asked")
          return { ...local, latest: "0.48.0" }
        },
        newer: (versions) => versions.latest === "0.48.0",
      },
      show: async (initial, controls) => {
        shown.push(initial)
        events.push("shown")
        const release = await controls.release()
        events.push(`release ${release.versions.latest} ${release.newer}`)
        for (const [side, ids] of rebuilds) {
          const progress: string[] = []
          const outcome = await controls.rebuild({ command: "recomp", side, ids }, (text) => progress.push(text))
          events.push(`rebuilt ${outcome.result.join(" | ")} ${progress.join(" | ")} ${outcome.left !== undefined || outcome.right !== undefined}`)
        }
        if (initial.right !== null) {
          events.push(controls.apply([], true, "all").result[0]!)
          const applied = controls.apply([], false, "sessions")
          events.push(applied.result[0]!, `checked again: ${applied.right?.health !== undefined}`)
          events.push(controls.apply([], true, "all").result[0]!)
        }
      },
    })
    return { adapter, output, events, shown }
  }

  it("shows this machine's profile, or two named profiles, and closes them after the browser quits", async () => {
    const one = cli()
    expect(await one.adapter.run([])).toBe(0)
    expect(one.events).toEqual([
      "open left /home/me/.local/share/opencode/opencode.db /home/me/.local/share/cortexkit/magic-context/context.db",
      "verify left /data/left/opencode/opencode.db all 300",
      "shown",
      "npm asked",
      "release 0.48.0 true",
      "close left",
    ])
    // Each side is shown with its health, checked by verify when it is opened.
    expect(one.shown[0]).toEqual(createBrowser({ ...opened("left", []), health: {} }, null, 1, { versions: { pinned: "0.47.0", loaded: "0.47.0", latest: null }, newer: false }))
    const two = cli()
    // --offline: npm is not asked.
    expect(await two.adapter.run(["--right", "/r", "--offline", "--map", "C:\\Users\\Me=/home/me", "--left", "/l"])).toBe(0)
    const rule = '[{"from":"C:\\\\Users\\\\Me","to":"/home/me"}]'
    expect(two.events).toEqual([
      "open left /l/opencode/opencode.db /l/cortexkit/magic-context/context.db",
      "verify left /data/left/opencode/opencode.db all 300",
      "open right /r/opencode/opencode.db /r/cortexkit/magic-context/context.db",
      "verify right /data/right/opencode/opencode.db all 300",
      "shown",
      "release offline false",
      `apply left right 0 all ${rule}`,
      "checked",
      `apply left right 0 sessions ${rule}`,
      // The side the apply read again is checked again (its snapshot is what verify reads).
      "verify right /fresh/opencode/opencode.db all 300",
      "done",
      "checked again: true",
      `apply left right 0 all ${rule}`,
      "checked",
      "close left",
      "close right",
    ])
    // What changed a store is printed once the browser is closed.
    expect(two.output.lines).toEqual(["done"])
    const files = cli()
    expect(await files.adapter.run(["--left-db", "/a/x.db", "--right-db", "/b/y.db", "--right-context", "/b/c.db"])).toBe(0)
    expect(files.events.filter((event) => event.startsWith("open"))).toEqual(["open left /a/x.db ", "open right /b/y.db /b/c.db"])
  })

  it("rebuilds through OpenCode on this machine's own profile only, reads that side again, and reports a failure", async () => {
    const runs = cli(false, [
      ["left", ["ses_a"]],
      ["right", ["ses_b"]],
      ["left", ["ses_boom"]],
      ["left", ["ses_text"]],
    ], { XDG_DATA_HOME: "/data/left" })
    expect(await runs.adapter.run(["--right", "/r", "--offline"])).toBe(0)
    const live = "/data/left"
    expect(runs.events.filter((event) => event.startsWith("rebuil") || event.startsWith("verify left") || event.startsWith("open left"))).toEqual([
      `open left ${live}/opencode/opencode.db ${live}/cortexkit/magic-context/context.db`,
      "verify left /data/left/opencode/opencode.db all 300",
      `rebuild recomp /data/left/cortexkit/magic-context/context.db ses_a true`,
      `open left /data/left/opencode/opencode.db /data/left/cortexkit/magic-context/context.db`,
      "verify left /data/left/opencode/opencode.db all 300",
      "rebuilt /ctx-recomp through http://s: no sessions | OK ses_a: running · 1 summaries to message 2 · 1 s true",
      "rebuilt /ctx-recomp runs through this machine's OpenCode: only for the side showing /data/left.  false",
      `rebuild recomp /data/left/cortexkit/magic-context/context.db ses_boom true`,
      "rebuilt Not started: no running OpenCode server found (looked for /state/service.json); start OpenCode, or name it with --server <url> ses_boom: running · 1 summaries to message 2 · 1 s false",
      `rebuild recomp /data/left/cortexkit/magic-context/context.db ses_text true`,
      "rebuilt Not started: plain ses_text: running · 1 summaries to message 2 · 1 s false",
    ])
  })

  it("refuses a map rule it cannot read, before opening anything", async () => {
    const { adapter, events } = cli()
    await expect(adapter.run(["--map", "no-equals-sign"])).rejects.toThrow()
    expect(events).toEqual([])
  })

  it("closes what it opened when a profile fails, and prints the usage for unknown arguments", async () => {
    const broken = cli(true)
    await expect(broken.adapter.run(["--right", "/r"])).rejects.toThrow("right is broken")
    expect(broken.events.map((event) => event.split(" ").slice(0, 2).join(" "))).toEqual(["open left", "verify left", "open right", "close left"])
    for (const argv of [
      ["--left"],
      ["--left", "--right"],
      ["--top", "/x"],
      ["--left", "/a", "--left-db", "/b.db"],
      ["--right-context", "/c.db"],
      ["--map", "--left"],
    ]) {
      const { adapter, output, events } = cli()
      expect(await adapter.run(argv)).toBe(2)
      expect(output.lines).toEqual([TUI_USAGE])
      expect(events).toEqual([])
    }
  })
})
