import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { Database } from "bun:sqlite"
import { chmodSync, copyFileSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { createTestRenderer, type TestRendererSetup } from "@opentui/core/testing"
import { buildContainer } from "@session-manager/main/cli-container"
import { showBrowser, terminalRenderer } from "@session-manager/infrastructure/adapters/inbound/manager-tui/OpenTuiBrowser"
import { captureConsole } from "@test/support/maintenance/console"
import { removeTemporary, temporaryWorkspace } from "@test/support/maintenance/temporary"
import { currentPlatform } from "@test/support/platform"
import { makeContextStore, makeOpenCodeStore } from "@test/support/sessions/stores"
import { waitForText } from "@test/support/sessions/frames"
import { silentTerminal } from "@test/support/sessions/terminal-streams"

let directory = ""
beforeEach(() => {
  directory = temporaryWorkspace("oc-browser-e2e-")
})
afterEach(() => {
  if (existsSync(join(directory, "right", "opencode"))) chmodSync(join(directory, "right", "opencode"), 0o755)
  removeTemporary(directory)
})

/**
 * A store SQLite cannot open where it lies, for real: a WAL database whose `-shm` is missing, in a
 * folder it may not write. Opening it read-only must create the `-shm`, which the folder refuses; a
 * copy elsewhere opens fine. (An NTFS-compressed Windows partition fails the same way, with `disk I/O error`.)
 */
function makeUnopenableInPlace(file: string): void {
  const db = new Database(file)
  db.exec("pragma journal_mode = wal; pragma wal_autocheckpoint = 0; create table probe(x); insert into probe values (1)")
  copyFileSync(file, `${file}.kept`)
  copyFileSync(`${file}-wal`, `${file}-wal.kept`)
  db.close()
  renameSync(`${file}.kept`, file)
  renameSync(`${file}-wal.kept`, `${file}-wal`)
  rmSync(`${file}-shm`, { force: true })
  chmodSync(join(file, ".."), 0o555)
}

describe("the terminal renderer", () => {
  it("opens full screen with the mouse on, on any terminal streams", async () => {
    const renderer = await terminalRenderer({ ...silentTerminal(80, 24), bufferedOutput: "memory" })
    try {
      expect(renderer.useMouse).toBe(true)
    } finally {
      renderer.destroy()
    }
  })
})

describe("tui (real stores, the wired container, OpenTUI's test renderer)", () => {
  it("browses this machine's profile beside one read from a snapshot, and removes the snapshot on quit", async () => {
    makeOpenCodeStore(join(directory, "left", "opencode", "opencode.db"), {
      v2: [{ id: "ses_shared", title: "Shared session", directory: "/home/me/repo", updated: 20, entries: 4 }],
    })
    makeContextStore(join(directory, "left", "cortexkit", "magic-context", "context.db"), { version: 94, compartments: { ses_shared: 2 } })
    const rightDb = join(directory, "right", "opencode", "opencode.db")
    makeOpenCodeStore(rightDb, {
      v2: [
        { id: "ses_shared", title: "Shared session", directory: "C:/Users/Me/repo", updated: 10, entries: 3 },
        { id: "ses_only", title: "Windows only", directory: "C:/Users/Me/other", updated: 5, entries: 1 },
      ],
    })
    makeUnopenableInPlace(rightDb)

    // This machine runs Magic Context 0.47.0 (pinned and installed); a stand-in registry publishes 0.48.0.
    mkdirSync(join(directory, ".config", "opencode"), { recursive: true })
    writeFileSync(
      join(directory, ".config", "opencode", "opencode.jsonc"),
      '{ /* pinned */ "theme": "a \\"quoted\\" name", // see below\n "plugin": ["@cortexkit/opencode-magic-context@0.47.0"] }',
    )
    // Several installs of the spec: the newest is what OpenCode loads.
    for (const [stamp, version] of [["1", "0.47.0"], ["0", "0.46.9"], ["2", "0.47.0"]]) {
      const installed = join(directory, ".cache", "opencode", "npm", "@cortexkit", "opencode-magic-context@0.47.0", stamp!, "node_modules", "@cortexkit", "opencode-magic-context")
      mkdirSync(installed, { recursive: true })
      writeFileSync(join(installed, "package.json"), `{ "version": "${version}" }`)
    }
    const registry = Bun.serve({ port: 0, fetch: () => Response.json({ version: "0.48.0" }) })

    let setup: TestRendererSetup | undefined
    const temporary = join(directory, "tmp")
    const out = captureConsole()
    try {
      const cli = await buildContainer(
        { XDG_DATA_HOME: join(directory, "left"), OPENCODE_SESSION_MANAGER_NPM_REGISTRY: registry.url.origin },
        {
          runtime: Object.assign(Object.create(null), {
            pid: () => process.pid,
            platform: () => currentPlatform(),
            now: () => Date.now(),
            stamp: () => "2026-10-08-00-00-00",
            temporaryDirectory: () => temporary,
            homeDirectory: () => directory,
          }),
          show: showBrowser(async () => {
            setup = await createTestRenderer({ width: 140, height: 30 })
            return setup.renderer
          }),
        },
      )
      const running = cli.run(["tui", "--right", join(directory, "right")])
      while (setup === undefined) await new Promise((resolve) => setTimeout(resolve, 10))
      const first = await setup.waitForFrame((text) => text.includes("Windows only"))
      expect(await waitForText(setup, "Magic Context 0.47.0 · 0.48.0 available on npm")).toStartWith(" Magic Context 0.47.0")
      expect(first).toContain("left · 1 sessions · Magic Context format 94")
      expect(first).toContain("right (snapshot) · 2 sessions · no Magic Context")
      expect(first).toContain("> Shared session")
      expect(first).toContain("< Shared session")
      expect(first).toContain("+ Windows only")
      expect(readdirSync(join(temporary, "opencode"))).toEqual(["session-manager-2026-10-08-00-00-00-right"])
      setup.mockInput.pressArrow("down")
      expect(await setup.waitForFrame((text) => text.includes("Magic Context: 2 summaries"))).toContain("ses_shared · v2")
      // Every key family, the mouse and a resize, through the real renderer.
      const input = setup.mockInput
      input.pressKey("\u001b[6~")
      input.pressKey("\u001b[5~")
      input.pressKey("g", { shift: true })
      input.pressKey("g")
      input.pressEnter()
      expect(await setup.waitForFrame((text) => text.includes("▸ /home/me/repo"))).toContain("1 sessions (collapsed)")
      input.pressEnter()
      input.pressTab()
      expect(await setup.waitForFrame((text) => text.includes("updated 1970-01-01 00:00 · 3 messages"))).toContain("ses_shared · v2")
      input.pressKey("h")
      input.pressKey("/")
      await input.typeText("zz")
      input.pressBackspace()
      input.pressKey("c", { ctrl: false })
      expect(await setup.waitForFrame((text) => text.includes("filter: zc▏"))).toBeTruthy()
      input.pressEnter()
      expect(await setup.waitForFrame((text) => text.includes('filter "zc"'))).toContain("No sessions.")
      input.pressEscape()
      // A lone Escape is told apart from the start of an escape sequence by a short real-time wait.
      for (let tries = 0; tries < 50 && !setup.captureCharFrame().includes("Shared session"); tries++) {
        await new Promise((resolve) => setTimeout(resolve, 20))
        await setup.renderOnce()
      }
      expect(setup.captureCharFrame()).toContain("Shared session")
      await setup.mockMouse.click(80, 5)
      expect(await setup.waitForFrame((text) => text.includes("ses_only · v2"))).toBeTruthy()
      await setup.mockMouse.scroll(80, 5, "down")
      await setup.mockMouse.scroll(80, 5, "up")
      setup.resize(140, 20)
      await setup.waitForFrame((text) => text.split("\n").length >= 20)
      // Pair by id, mark, queue a whole-session sync each way, and edit the queue.
      input.pressKey("p")
      await setup.waitForFrame((text) => text.includes("paired by session id"))
      input.pressKey("g")
      input.pressArrow("down")
      input.pressKey(" ")
      expect(await setup.waitForFrame((text) => text.includes("● > Shared session"))).toContain("ses_shared · newer on the left")
      input.pressKey(">")
      expect(await setup.waitForFrame((text) => text.includes("Queued 1 session sync →."))).toBeTruthy()
      // Queued again: the entry is replaced, not added twice. Then the paired list is filtered.
      input.pressKey(">")
      await input.typeText("/Windows")
      input.pressEnter()
      expect(await setup.waitForFrame((text) => text.includes('filter "Windows"'))).not.toContain("Shared session")
      input.pressKey("/")
      input.pressEscape()
      for (let tries = 0; tries < 50 && !setup.captureCharFrame().includes("Shared session"); tries++) {
        await new Promise((resolve) => setTimeout(resolve, 20))
        await setup.renderOnce()
      }
      input.pressKey("g")
      input.pressKey(" ")
      expect(await setup.waitForFrame((text) => text.includes("(1) ●1"))).toContain("1 marked")
      input.pressKey(" ")
      input.pressKey("*")
      input.pressKey("<")
      expect(await setup.waitForFrame((text) => text.includes("Queued 2 session syncs ←."))).toBeTruthy()
      input.pressKey("Q")
      const queue = await setup.waitForFrame((text) => text.includes("Queue · 2 session syncs · 1 new on the target"))
      expect(queue).toContain("further new: copy")
      expect(queue).toContain("further both: d to check")
      input.pressArrow("down")
      input.pressKey("r")
      expect(await setup.waitForFrame((text) => text.includes("keep    new: copy"))).toBeTruthy()
      input.pressKey("R")
      input.pressKey("t")
      expect(await setup.waitForFrame((text) => text.includes("Magic Context: sessions only"))).toContain("replace")
      input.pressKey("x")
      input.pressKey("x")
      expect(await setup.waitForFrame((text) => text.includes("The queue is empty"))).toBeTruthy()
      input.pressKey("c")
      input.pressKey("Q")
      await setup.waitForFrame((text) => text.includes("paired by session id"))
      input.pressKey("q")
      expect(await running).toBe(0)
    } finally {
      out.restore()
      registry.stop(true)
    }
    expect(readdirSync(join(temporary, "opencode"))).toEqual([])
  })

  it("opens a profile named by its store files, alone", async () => {
    const db = join(directory, "files", "sessions.db")
    const context = join(directory, "files", "context.db")
    makeOpenCodeStore(db, { v2: [{ id: "ses_file", title: "From a file", directory: "/x", updated: 1, entries: 1 }] })
    makeContextStore(context, { version: 94, compartments: { ses_file: 3 } })
    // The profile title shows the store folder; a long temporary folder needs more columns than
    // 120 on macOS, so the renderer is widened to fit it (`/var` vs `/private/var`).
    const title = `left · 1 sessions · Magic Context format 94 · health 0! 0~ · ${join(directory, "files")}`
    let setup: TestRendererSetup | undefined
    const cli = await buildContainer(
      { OPENCODE_SESSION_MANAGER_OFFLINE: "1", XDG_CONFIG_HOME: join(directory, "no-config"), XDG_CACHE_HOME: join(directory, "no-cache") },
      {
        show: showBrowser(async () => {
          setup = await createTestRenderer({ width: Math.max(120, title.length + 8), height: 20 })
          return setup.renderer
        }),
      },
    )
    const running = cli.run(["tui", "--left-db", db, "--left-context", context])
    while (setup === undefined) await new Promise((resolve) => setTimeout(resolve, 10))
    const shown = await setup.waitForFrame((text) => text.includes("From a file"))
    // Offline: npm is not asked, and this home has no OpenCode configuration.
    expect(await waitForText(setup, "Magic Context: not configured in opencode.jsonc")).toBeTruthy()
    // verify ran when the side was opened, and found nothing wrong.
    expect(shown).toContain(title)
    expect(shown).toContain("S 3")
    setup.mockInput.pressKey("j")
    expect(await setup.waitForFrame((text) => text.includes("Health:"))).toContain("Health: 1 of 1 messages after the newest of 3 summaries · ok")
    setup.mockInput.pressKey("p")
    expect(await setup.waitForFrame((text) => text.includes("Open a second profile with --right to pair sessions."))).toBeTruthy()
    setup.mockInput.pressKey("q")
    expect(await running).toBe(0)
    const out = captureConsole()
    try {
      expect(await cli.run(["tui", "--left-context", context])).toBe(2)
    } finally {
      out.restore()
    }
    expect(out.lines[0]).toStartWith("usage: opencode-session-manager tui [--left <dataHome> | --left-db <opencode.db>")
  })
})
