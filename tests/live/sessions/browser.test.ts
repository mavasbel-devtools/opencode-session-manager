import { afterAll, beforeAll, describe, expect, it } from "bun:test"
import { existsSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { defaultDataHome, profileAt } from "@session-manager/domain/model/Profile"
import { removeTemporary, temporaryWorkspace } from "@test/support/maintenance/temporary"

/**
 * The session browser in a real pseudo-terminal, on this machine's real profile (read-only, so safe
 * while OpenCode runs): from source, and as the compiled executable when `bun run build` made one.
 */
const project = fileURLToPath(new URL("../../..", import.meta.url))
const driver = join(project, "tests", "support", "live", "drive-browser.mjs")
const compiled = join(project, "dist", "cli", process.platform === "win32" ? "opencode-session-manager.exe" : "opencode-session-manager")
const live = profileAt("live", defaultDataHome({ XDG_DATA_HOME: process.env["XDG_DATA_HOME"] }, process.env["HOME"] ?? homedir()))
const node = Bun.which("node")

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
  expect(run.screens[0]!.join("\n")).toMatch(/left · \d+ sessions/)
  expect(run.screens[1]!.join("\n")).toMatch(/ses_\w+ · v[12] · project /)
  expect(run.screens[5]!.join("\n")).toContain("Queue · 0 Magic Context copies")
}

describe("the session browser in a real terminal", () => {
  it.skipIf(node === null || !existsSync(live.opencodeDb))("runs from source", () => {
    expectBrowsed(drive(process.execPath, join(project, "src", "main", "cli", "cli.ts"), "tui"))
  }, 120_000)

  it.skipIf(node === null || !existsSync(live.opencodeDb) || !existsSync(compiled))("runs as the compiled executable", () => {
    expectBrowsed(drive(compiled, "tui"))
  }, 120_000)
})
