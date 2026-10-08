import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { Database } from "bun:sqlite"
import { chmodSync, copyFileSync, existsSync, readdirSync, renameSync, rmSync } from "node:fs"
import { join } from "node:path"
import { createTestRenderer, type TestRendererSetup } from "@opentui/core/testing"
import { buildContainer } from "@session-manager/main/cli-container"
import { showBrowser, terminalRenderer } from "@session-manager/infrastructure/adapters/inbound/manager-tui/OpenTuiBrowser"
import { captureConsole } from "@test/support/maintenance/console"
import { removeTemporary, temporaryWorkspace } from "@test/support/maintenance/temporary"
import { makeContextStore, makeOpenCodeStore } from "@test/support/sessions/stores"
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

    let setup: TestRendererSetup | undefined
    const temporary = join(directory, "tmp")
    const out = captureConsole()
    try {
      const cli = await buildContainer(
        { XDG_DATA_HOME: join(directory, "left") },
        {
          runtime: Object.assign(Object.create(null), {
            pid: () => process.pid,
            platform: () => process.platform,
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
      expect(await setup.waitForFrame((text) => text.includes("Folder C:/Users/Me/repo"))).toBeTruthy()
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
      await setup.mockMouse.click(80, 4)
      expect(await setup.waitForFrame((text) => text.includes("ses_only · v2"))).toBeTruthy()
      await setup.mockMouse.scroll(80, 4, "down")
      await setup.mockMouse.scroll(80, 4, "up")
      setup.resize(140, 20)
      await setup.waitForFrame((text) => text.split("\n").length >= 20)
      input.pressKey("q")
      expect(await running).toBe(0)
    } finally {
      out.restore()
    }
    expect(readdirSync(join(temporary, "opencode"))).toEqual([])
  })
})
