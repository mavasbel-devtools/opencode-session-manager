import { afterAll, describe, expect, test } from "bun:test"
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { removeTemporary } from "@test/support/live/process"

const project = path.resolve(import.meta.dir, "../..")
const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "session-manager-installer-lanes-"))

afterAll(async () => {
  // Only ever the directory this file created, strictly inside the OS temp directory.
  if (temporaryRoot && path.resolve(temporaryRoot).startsWith(path.resolve(os.tmpdir()) + path.sep)) {
    await removeTemporary(temporaryRoot)
  }
})

function environment(extra: Record<string, string>) {
  return Object.fromEntries(
    Object.entries({ ...process.env, OPENCODE_V2_PLUGIN_DIR: "", ...extra }).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  )
}

async function run(arguments_: string[], env: Record<string, string>) {
  const child = Bun.spawn([globalThis.process.execPath, ...arguments_], { cwd: project, env, stdout: "pipe", stderr: "pipe" })
  const [exitCode, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()])
  return { exitCode, stdout, stderr }
}

async function must(arguments_: string[], env: Record<string, string>) {
  const result = await run(arguments_, env)
  if (result.exitCode !== 0) throw new Error(`${arguments_.join(" ")} failed: ${result.stdout}${result.stderr}`)
  return result
}

describe("plugins-directory installer contract", () => {
  test("install deposits one folder that matches the build and validates", async () => {
    const plugins = path.join(temporaryRoot, "slot", "plugins")
    const env = environment({ OPENCODE_V2_PLUGIN_DIR: plugins })

    await must(["run", "install:plugin:v2"], env)
    expect(await readdir(plugins)).toEqual(["session-manager"])
    expect((await readdir(path.join(plugins, "session-manager"))).sort()).toEqual(["server.js", "tui.js"])
    expect(await Bun.file(path.join(plugins, "session-manager", "tui.js")).bytes()).toEqual(await Bun.file(path.join(project, "dist", "v2", "tui.js")).bytes())
    expect(await Bun.file(path.join(plugins, "session-manager", "server.js")).bytes()).toEqual(await Bun.file(path.join(project, "dist", "v2", "server.js")).bytes())
    await must(["run", "validate:installed:v2"], env)
  }, 120_000)

  test("without a plugin-dir variable the target is <XDG_CONFIG_HOME>/opencode/plugins", async () => {
    const configHome = path.join(temporaryRoot, "xdg")
    const result = await must(["scripts/install-plugin.mjs", "v2"], environment({ XDG_CONFIG_HOME: configHome }))
    expect(JSON.parse(result.stdout).directory).toBe(path.join(configHome, "opencode", "plugins", "session-manager"))
  }, 60_000)

  test("validation rejects an installed file that differs from the build", async () => {
    const plugins = path.join(temporaryRoot, "tamper", "plugins")
    const env = environment({ OPENCODE_V2_PLUGIN_DIR: plugins })
    await must(["scripts/install-plugin.mjs", "v2"], env)
    await writeFile(path.join(plugins, "session-manager", "tui.js"), "export default {}\n")
    const result = await run(["scripts/install-plugin.mjs", "validate-v2"], env)
    expect(result.exitCode).not.toBe(0)
    expect(result.stderr).toContain("differs from")
  }, 60_000)

  test("install retires the OpenCode 1 form and the two plugins this one replaces, and validation refuses them", async () => {
    const plugins = path.join(temporaryRoot, "legacy", "plugins")
    const env = environment({ OPENCODE_V2_PLUGIN_DIR: plugins })
    const retired = [
      "session-manager.js",
      "session-manager.tui.js",
      "session-id/server.js",
      "session-id/tui.js",
      "sessions-transfer/server.js",
      "sessions-transfer/tui.js",
      "sessions-transfer.js",
      "sessions-transfer.tui.js",
    ]
    for (const file of retired) await Bun.write(path.join(plugins, file), "export default {}\n")
    await Bun.write(path.join(plugins, "unrelated.js"), "export default {}\n")
    await must(["scripts/install-plugin.mjs", "v2"], env)
    expect((await readdir(plugins)).sort()).toEqual(["session-manager", "unrelated.js"])

    for (const file of ["session-id/server.js", "session-manager.tui.js"]) {
      await Bun.write(path.join(plugins, file), "export default {}\n")
      const refused = await run(["scripts/install-plugin.mjs", "validate-v2"], env)
      expect(refused.exitCode).not.toBe(0)
      expect(refused.stderr).toContain(`${path.join(plugins, file)} must not coexist`)
      await rm(path.join(plugins, file))
    }
  }, 120_000)

  test("installation never writes or edits configuration", async () => {
    const configHome = path.join(temporaryRoot, "config-untouched")
    const config = path.join(configHome, "opencode", "opencode.jsonc")
    await Bun.write(config, '{ "plugins": ["unrelated"] }\n')
    await must(["scripts/install-plugin.mjs", "v2"], environment({ XDG_CONFIG_HOME: configHome }))
    expect(await Bun.file(config).text()).toBe('{ "plugins": ["unrelated"] }\n')
    expect((await readdir(path.join(configHome, "opencode"))).sort()).toEqual(["opencode.jsonc", "plugins"])
  }, 60_000)

  test("an unknown command is rejected", async () => {
    const result = await run(["scripts/install-plugin.mjs", "deploy-v2"], environment({}))
    expect(result.exitCode).not.toBe(0)
    expect(result.stderr).toContain("usage: bun scripts/install-plugin.mjs")
  })
})
