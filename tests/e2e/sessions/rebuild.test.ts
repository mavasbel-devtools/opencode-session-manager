import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { Database } from "bun:sqlite"
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { createTestRenderer, type TestRendererSetup } from "@opentui/core/testing"
import type { RuntimePort } from "@session-manager/domain/ports/outbound/RuntimePort"
import { showBrowser } from "@session-manager/infrastructure/adapters/inbound/manager-tui/OpenTuiBrowser"
import { buildContainer } from "@session-manager/main/cli-container"
import { captureConsole } from "@test/support/maintenance/console"
import { removeTemporary, temporaryWorkspace } from "@test/support/maintenance/temporary"
import { waitForText } from "@test/support/sessions/frames"
import { makeOpenCodeStore } from "@test/support/sessions/stores"
import { makeSyncContextStore, rowsOf } from "@test/support/sessions/sync-stores"

/**
 * `context wrapup|recomp` and the browser's W/R over the wired container, real stores and a real
 * HTTP server standing in for OpenCode: it checks the password, answers the command endpoint as
 * OpenCode 2.0.26 does (204, or 404 LocationNotFoundError for a folder that is gone) and, as
 * Magic Context does inside OpenCode, writes the summaries and the historian run into the store.
 */
let directory = ""
beforeEach(() => {
  directory = temporaryWorkspace("oc-rebuild-e2e-")
})
afterEach(() => {
  removeTemporary(directory)
})

const at = (...parts: string[]) => join(directory, ...parts)
const contextDb = () => at("data", "cortexkit", "magic-context", "context.db")

function runtime(): RuntimePort {
  mkdirSync(at("tmp"), { recursive: true })
  return {
    pid: () => process.pid,
    platform: () => process.platform,
    now: () => Date.now(),
    stamp: () => "2026-10-12-12-00-00",
    temporaryDirectory: () => at("tmp"),
    homeDirectory: () => at("home"),
  }
}

/** The stand-in OpenCode, recorded in service.json the way the OpenCode service records itself. */
function openCode() {
  const commands: string[] = []
  const server = Bun.serve({
    port: 0,
    async fetch(request) {
      if (request.headers.get("authorization") !== `Basic ${Buffer.from("opencode:secret").toString("base64")}`) return new Response("Unauthorized", { status: 401 })
      const id = new URL(request.url).pathname.split("/")[3]!
      const body = (await request.json()) as { name: string; text: string }
      commands.push(`${id} ${body.name} "${body.text}"`)
      if (id === "ses_gone") return Response.json({ _tag: "LocationNotFoundError", message: `Location not found: ${at("home", "gone")}` }, { status: 404 })
      const db = new Database(contextDb())
      try {
        const now = Date.now()
        for (let sequence = 1; sequence <= 2; sequence++)
          db.query(
            "insert into compartments (session_id, sequence, start_message, end_message, start_message_id, end_message_id, title, content, created_at, harness) values (?, ?, ?, ?, '', '', 't', 'c', ?, 'opencode2')",
          ).run(id, 10 + sequence, sequence * 50, sequence * 50 + 49, now)
        db.query("insert into historian_runs (session_id, harness, run_kind, status, chunk_start_ordinal, chunk_end_ordinal, compartments_produced, created_at) values (?, 'opencode2', ?, 'success', 50, 149, 2, ?)").run(
          id,
          body.name === "ctx-recomp" ? "recomp" : "wrapup",
          now,
        )
      } finally {
        db.close()
      }
      return new Response(null, { status: 204 })
    },
  })
  mkdirSync(at("state", "opencode"), { recursive: true })
  writeFileSync(at("state", "opencode", "service.json"), JSON.stringify({ id: "x", version: "2.0.26", url: server.url.origin, pid: 1, password: "secret" }))
  return { server, commands }
}

function profile() {
  makeOpenCodeStore(at("data", "opencode", "opencode.db"), {
    v2: [
      { id: "ses_a", title: "Behind", directory: at("home", "work"), updated: 20, entries: 3 },
      { id: "ses_gone", title: "Moved away", directory: at("home", "gone"), updated: 10, entries: 2 },
    ],
  })
  makeSyncContextStore(contextDb(), { format: 95, sessions: { ses_a: { compartments: [{ start: "ses_a-m0", end: "ses_a-m0" }] } } })
}

const environment = () => ({ XDG_DATA_HOME: at("data"), XDG_STATE_HOME: at("state"), OPENCODE_SESSION_MANAGER_OFFLINE: "1" })
const noWait = { sleep: async () => {} }

describe("context wrapup and recomp (wired container, real stores, an HTTP stand-in for OpenCode)", () => {
  it("runs the command through the recorded server, follows it in the store, and reports a refusal", async () => {
    profile()
    const { server, commands } = openCode()
    const out = captureConsole()
    try {
      // The real timer: one look at the store after the poll interval (10 s) finds it finished.
      const cli = await buildContainer(environment(), { runtime: runtime() })
      expect(await cli.run(["context", "wrapup", "--session", "ses_a", "--keep", "30"])).toBe(0)
      expect(out.lines.at(-1)).toBe("OK")
      expect(out.lines.find((line) => line.includes("summaries 1 → 3"))).toStartWith("ses_a: finished · summaries 1 → 3, to message 0 → to message 149 · 1 runs (0 failed)")
      expect(out.lines.some((line) => line.startsWith("ses_a: finished · 3 summaries to message 149 · last run success (50–149)"))).toBe(true)
      out.lines.length = 0
      expect(await cli.run(["context", "recomp", "--session", "ses_gone", "--json"])).toBe(1)
      const report = JSON.parse(out.lines.join("\n"))
      expect(report).toMatchObject({ server: server.url.origin, context_db: contextDb(), command: "recomp", ok: false })
      expect(report.sessions[0]).toMatchObject({ session_id: "ses_gone", status: "refused", detail: `the server answered 404: Location not found: ${at("home", "gone")}` })
      expect(commands).toEqual(['ses_a ctx-wrapup "30"', 'ses_gone ctx-recomp ""'])
      expect(rowsOf(contextDb(), "select count(*) as n from compartments where session_id = 'ses_a'")).toEqual([{ n: 3 }])
    } finally {
      out.restore()
      server.stop(true)
    }
  })

  it("refuses without a recorded server, and names another one with --server", async () => {
    profile()
    const out = captureConsole()
    try {
      const cli = await buildContainer(environment(), { runtime: runtime(), timer: noWait })
      await expect(cli.run(["context", "wrapup", "--session", "ses_a"])).rejects.toThrow(`no running OpenCode server found (looked for ${at("state", "opencode", "service.json")})`)
      expect(await cli.run(["context", "wrapup", "--session", "ses_a", "--server", "http://127.0.0.1:9", "--no-wait"])).toBe(1)
      expect(out.lines.find((line) => line.startsWith("ses_a: refused"))).toStartWith("ses_a: refused (the server answered nothing: ")
    } finally {
      out.restore()
    }
  })
})

describe("the browser's W and R (wired container, real stores, an HTTP stand-in for OpenCode)", () => {
  it("asks, runs /ctx-wrapup on this machine's profile (here the right side), shows the outcome and the store read again", async () => {
    profile()
    makeOpenCodeStore(at("other", "opencode", "opencode.db"), { v2: [{ id: "ses_a", title: "Behind", directory: "C:/work", updated: 20, entries: 3 }] })
    const { server, commands } = openCode()
    let setup: TestRendererSetup | undefined
    try {
      const cli = await buildContainer(environment(), {
        runtime: runtime(),
        timer: noWait,
        show: showBrowser(async () => {
          setup = await createTestRenderer({ width: 160, height: 30 })
          return setup.renderer
        }),
      })
      const running = cli.run(["tui", "--left", at("other"), "--right", at("data")])
      while (setup === undefined) await new Promise((resolve) => setTimeout(resolve, 10))
      await waitForText(setup, "Behind")
      // The left side is not this machine's: nothing runs there.
      setup.mockInput.pressArrow("down")
      setup.mockInput.pressKey("W", { shift: true })
      setup.mockInput.pressKey("W", { shift: true })
      expect(await waitForText(setup, "/ctx-wrapup runs through this machine's OpenCode: only for the side showing")).toBeTruthy()
      setup.mockInput.pressTab()
      setup.mockInput.pressKey("W", { shift: true })
      await waitForText(setup, "W again: /ctx-wrapup (summarise what lags) on 1 session of the right")
      setup.mockInput.pressKey("W", { shift: true })
      expect(await waitForText(setup, `/ctx-wrapup through ${server.url.origin}: 1 finished`)).toBeTruthy()
      expect(await waitForText(setup, "S 3")).toContain("Behind")
      expect(setup.captureCharFrame()).toContain("right · 2 sessions")
      setup.mockInput.pressKey("q")
      const out = captureConsole()
      try {
        expect(await running).toBe(0)
      } finally {
        out.restore()
      }
      // Printed whole once the browser has closed.
      expect(out.lines.find((line) => line.includes("summaries 1 → 3"))).toStartWith("ses_a: finished · summaries 1 → 3")
      expect(commands).toEqual(['ses_a ctx-wrapup ""'])
    } finally {
      server.stop(true)
    }
  })

  it("runs /ctx-recomp with R on this machine's profile shown alone on the left", async () => {
    profile()
    const { server, commands } = openCode()
    let setup: TestRendererSetup | undefined
    try {
      const cli = await buildContainer(environment(), {
        runtime: runtime(),
        timer: noWait,
        show: showBrowser(async () => {
          setup = await createTestRenderer({ width: 160, height: 30 })
          return setup.renderer
        }),
      })
      const out = captureConsole()
      let code: number
      try {
        const running = cli.run(["tui"])
        while (setup === undefined) await new Promise((resolve) => setTimeout(resolve, 10))
        await waitForText(setup, "Behind")
        setup.mockInput.pressArrow("down")
        setup.mockInput.pressKey("R", { shift: true })
        setup.mockInput.pressKey("R", { shift: true })
        expect(await waitForText(setup, `/ctx-recomp through ${server.url.origin}: 1 finished`)).toBeTruthy()
        expect(await waitForText(setup, "S 3")).toContain("left · 2 sessions")
        setup.mockInput.pressKey("q")
        code = await running
      } finally {
        out.restore()
      }
      expect(code).toBe(0)
      expect(commands).toEqual(['ses_a ctx-recomp ""'])
    } finally {
      server.stop(true)
    }
  })
})
