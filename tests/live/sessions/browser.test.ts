import { afterAll, beforeAll, describe, expect, it } from "bun:test"
import { Database } from "bun:sqlite"
import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { defaultDataHome, profileAt } from "@session-manager/domain/model/Profile"
import { removeTemporary, temporaryWorkspace } from "@test/support/maintenance/temporary"
import { liveOtherProfile } from "@test/support/live/fixtures"

/**
 * The session browser in a real pseudo-terminal, on this machine's real profile (read-only, so safe
 * while OpenCode runs): from source, and as the compiled executable when `bun run build` made one.
 * With OPENCODE_SM_LIVE_OTHER_PROFILE (another real data home), it also queues every session of that
 * profile for a sync into a copy of this machine's profile and checks the queue on copies (`d`).
 */
const project = fileURLToPath(new URL("../../..", import.meta.url))
const driver = join(project, "tests", "support", "live", "drive-browser.mjs")
const compiled = join(project, "dist", "cli", process.platform === "win32" ? "opencode-session-manager.exe" : "opencode-session-manager")
const live = profileAt("live", defaultDataHome({ XDG_DATA_HOME: process.env["XDG_DATA_HOME"] }, process.env["HOME"] ?? homedir()))
const node = Bun.which("node")
const other = liveOtherProfile

let directory = ""
let steps = ""
beforeAll(() => {
  directory = temporaryWorkspace("oc-browser-live-")
  steps = join(directory, "steps.json")
  writeFileSync(
    steps,
    JSON.stringify([
      { waitFor: "Details", timeoutMs: 60_000 },
      { keys: "j", waitFor: "· v" },
      { keys: "/ses_", waitFor: "filter: ses_" },
      { keys: "\u001b", waitFor: "↑↓ move" },
      { keys: " ", waitFor: "● " },
      { keys: "Q", waitFor: "Queue ·" },
      { keys: "\u001b", waitFor: "Space mark" },
      { keys: "q", settleMs: 500 },
    ]),
  )
})
afterAll(() => {
  removeTemporary(directory)
})

function drive(executable: string, ...args: string[]) {
  const result = Bun.spawnSync([node!, driver, steps, executable, ...args], { cwd: project, env: process.env })
  return JSON.parse(result.stdout.toString()) as { ok: boolean; exitCode: number | null; screens: string[][] }
}

function expectBrowsed(run: ReturnType<typeof drive>) {
  expect(run.ok).toBe(true)
  expect(run.exitCode).toBe(0)
  expect(run.screens[0]!.join("\n")).toMatch(/left · \d+ sessions · Magic Context format \d+ · health \d+! \d+~/)
  // The header names the Magic Context this machine's OpenCode loads (npm's answer may still be on its way).
  expect(run.screens[0]![0]).toMatch(/^ Magic Context \d+\.\d+\.\d+ · /)
  expect(run.screens[1]!.join("\n")).toMatch(/ses_\w+ · v[12] · project /)
  expect(run.screens[5]!.join("\n")).toContain("Queue · 0 session syncs · 0 new on the target")
}

describe("the session browser in a real terminal", () => {
  it.skipIf(node === null || !existsSync(live.opencodeDb))("runs from source", () => {
    expectBrowsed(drive(process.execPath, join(project, "src", "main", "cli", "cli.ts"), "tui"))
  }, 120_000)

  it.skipIf(node === null || !existsSync(live.opencodeDb) || !existsSync(compiled))("runs as the compiled executable", () => {
    expectBrowsed(drive(compiled, "tui"))
  }, 120_000)
})

describe("the session browser syncing real profiles", () => {
  it.skipIf(node === null || other === undefined || !existsSync(live.opencodeDb) || !existsSync(compiled))(
    "queues every session of the other profile into a copy of this machine's and checks the queue on copies, writing nothing",
    () => {
      const copy = profileAt("copy", join(directory, "copy"))
      for (const [from, to] of [
        [live.opencodeDb, copy.opencodeDb],
        [live.contextDb, copy.contextDb],
      ] as const) {
        if (!existsSync(from)) continue
        mkdirSync(dirname(to), { recursive: true })
        const db = new Database(from, { readonly: true })
        try {
          db.query("vacuum into ?").run(to)
        } finally {
          db.close()
        }
      }
      const before = [Bun.file(copy.opencodeDb).size, Bun.file(copy.contextDb).size]
      const syncSteps = join(directory, "sync-steps.json")
      writeFileSync(
        syncSteps,
        JSON.stringify([
          { waitFor: "Details", timeoutMs: 120_000 },
          { keys: "p", waitFor: "paired by session id" },
          { keys: "*", waitFor: "●" },
          { keys: "<", waitFor: "session sync" },
          { keys: "Q", waitFor: "Queue ·" },
          { keys: "d", waitFor: "← Dry run:", timeoutMs: 300_000 },
          { keys: "q", settleMs: 500 },
        ]),
      )
      const result = Bun.spawnSync([node!, driver, syncSteps, compiled, "tui", "--left", copy.dataHome, "--right", other!], { cwd: project, env: process.env })
      const run = JSON.parse(result.stdout.toString()) as { ok: boolean; exitCode: number | null; screens: string[][] }
      expect(run.ok).toBe(true)
      expect(run.exitCode).toBe(0)
      expect(run.screens[3]!.join("\n")).toMatch(/Queued \d+ session syncs? ←/)
      const checked = run.screens[5]!.join("\n")
      expect(checked).toMatch(/← Dry run: \d+ copied, \d+ replaced, \d+ kept, \d+ skipped/)
      // Every entry now says what the sync does with it, from the dry run.
      expect(checked).not.toContain("d to check")
      expect(checked).not.toContain("new: copy")
      expect([Bun.file(copy.opencodeDb).size, Bun.file(copy.contextDb).size]).toEqual(before)
    },
    900_000,
  )
})
