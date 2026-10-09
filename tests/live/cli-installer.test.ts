import { afterAll, beforeAll, describe, expect, it } from "bun:test"
import { appendFile, copyFile, mkdtemp, rename } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { removeTemporary, requireBun, run } from "@test/support/live/process"

let temporaryRoot = ""
let bin = ""
const installer = (args: string[], extra: Record<string, string> = {}) =>
  run([requireBun(), "scripts/install-cli.mjs", ...args], {
    env: { ...(process.env as Record<string, string>), OPENCODE_SESSION_MANAGER_BIN_DIR: bin, ...extra },
  })

beforeAll(async () => {
  const build = await run([requireBun(), "scripts/build.mjs"])
  if (build.exitCode !== 0) throw new Error(`build failed: ${build.stdout}${build.stderr}`)
  temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "opencode-session-manager-cli-installer-"))
  bin = path.join(temporaryRoot, "bin")
}, 300_000)

afterAll(async () => {
  await removeTemporary(temporaryRoot)
})

describe("install-cli.mjs", () => {
  it("installs the compiled CLI, byte-identical and answering --version, and warns when the folder is not on PATH", async () => {
    const installed = await installer(["install"], { PATH: "/usr/bin:/bin" })
    expect(installed.exitCode).toBe(0)
    const report = JSON.parse(installed.stdout.trim().split("\n").at(-1)!)
    expect(report).toMatchObject({ status: "valid", identical: true, onPath: false, target: path.join(bin, "opencode-session-manager") })
    expect(report.version).toMatch(/^opencode-session-manager \d+\.\d+\.\d+$/)
    expect(installed.stderr).toContain(`warning: ${bin} is not on PATH`)
    const reinstalled = await installer(["install"], { PATH: `${bin}:/usr/bin:/bin` })
    expect(reinstalled.stderr).toBe("")
    const help = await run([path.join(bin, "opencode-session-manager"), "--help"])
    expect(help.stdout).toContain("tui [--left <dataHome>] [--right <dataHome>]")
  }, 300_000)

  it("finds a changed install invalid, and refuses unknown commands", async () => {
    // Replaced by rename, as an executable that just ran may still be held open (ETXTBSY).
    const installed = path.join(bin, "opencode-session-manager")
    await copyFile(installed, `${installed}.tampered`)
    await appendFile(`${installed}.tampered`, "tampered")
    await rename(`${installed}.tampered`, installed)
    const validated = await installer(["validate"])
    expect(validated.exitCode).toBe(1)
    expect(JSON.parse(validated.stdout.trim()).identical).toBe(false)
    const unknown = await installer(["remove"])
    expect(unknown.exitCode).not.toBe(0)
    expect(unknown.stderr).toContain("usage: bun scripts/install-cli.mjs <install|validate>")
  }, 120_000)
})
