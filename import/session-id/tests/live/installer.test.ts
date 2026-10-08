import { afterAll, beforeAll, describe, expect, it } from "bun:test"
import { appendFile, mkdtemp, readdir, readFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { removeTemporary, requireBun, root, run } from "@test/support/live/process"

let temporaryRoot = ""
let plugins = ""
const base = () => ({ ...(process.env as Record<string, string>), OPENCODE_V2_PLUGIN_DIR: plugins })
const installer = (args: string[], env: Record<string, string>) => run([requireBun(), "scripts/install-plugin.mjs", ...args], { env })

beforeAll(async () => {
  const build = await run([requireBun(), "scripts/build.mjs"])
  if (build.exitCode !== 0) throw new Error(`build failed: ${build.stdout}${build.stderr}`)
  temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "opencode-session-id-installer-"))
  plugins = path.join(temporaryRoot, "opencode", "plugins")
  const installed = await installer(["v2"], base())
  if (installed.exitCode !== 0) throw new Error(installed.stderr)
}, 120_000)

afterAll(async () => {
  // Guarded: a beforeAll that throws leaves temporaryRoot empty, and an
  // unguarded rm("") would delete this repository (it happened once).
  await removeTemporary(temporaryRoot)
})

describe("install-plugin.mjs v2 contract", () => {
  it("writes exactly the folder <plugins>/session-id/ byte-identical to dist/v2, and nothing else", async () => {
    expect(await readdir(plugins)).toEqual(["session-id"])
    expect((await readdir(path.join(plugins, "session-id"))).sort()).toEqual(["server.js", "tui.js"])
    for (const file of ["server.js", "tui.js"]) {
      expect(Buffer.compare(await readFile(path.join(plugins, "session-id", file)), await readFile(path.join(root, "dist", "v2", file)))).toBe(0)
    }
    const valid = await installer(["validate-v2"], base())
    expect(valid.exitCode).toBe(0)
    expect(JSON.parse(valid.stdout)).toMatchObject({ host: "v2", directory: path.join(plugins, "session-id"), status: "valid" })
  })

  it("is idempotent: reinstalling replaces the same two files in place", async () => {
    const again = await installer(["v2"], base())
    expect(again.exitCode).toBe(0)
    expect((await readdir(path.join(plugins, "session-id"))).sort()).toEqual(["server.js", "tui.js"])
  })

  it("defaults to <XDG_CONFIG_HOME>/opencode/plugins and rejects an unknown command", async () => {
    const configHome = path.join(temporaryRoot, "xdg")
    const env = { ...(process.env as Record<string, string>), OPENCODE_V2_PLUGIN_DIR: "", XDG_CONFIG_HOME: configHome }
    const installed = await installer(["v2"], env)
    expect(installed.exitCode).toBe(0)
    expect(JSON.parse(installed.stdout).directory).toBe(path.join(configHome, "opencode", "plugins", "session-id"))
    const unknown = await installer(["deploy-v2"], base())
    expect(unknown.exitCode).not.toBe(0)
    expect(unknown.stderr).toContain("usage: bun scripts/install-plugin.mjs <v2|validate-v2>")
  }, 120_000)

  it("rejects a tampered installed artifact", async () => {
    await appendFile(path.join(plugins, "session-id", "tui.js"), "\n// changed\n")
    const bad = await installer(["validate-v2"], base())
    expect(bad.exitCode).not.toBe(0)
    expect(bad.stderr).toContain("artifact mismatch: tui.js")
    expect((await installer(["v2"], base())).exitCode).toBe(0)
  })
})
