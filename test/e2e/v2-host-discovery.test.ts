import { afterAll, beforeAll, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

/**
 * Real OpenCode 2.0.14 host, fully isolated XDG dirs: the installer's default target
 * (<XDG_CONFIG_HOME>/opencode/plugins) receives the `sessions-transfer/` folder, the config has NO
 * `plugins` entry, and the host must find the plugin by auto-discovery with both its server and TUI
 * entrypoints (the TUI is this plugin's whole feature).
 */
const project = path.resolve(import.meta.dir, "../..")
const executable = process.env.OPENCODE_V2_EXECUTABLE ?? path.join(os.homedir(), ".local", "bin", "opencode.exe")
const password = "sessions-transfer-discovery-password"

let temporaryRoot = ""
let configHome = ""
let workspace = ""
let environment: Record<string, string> = {}
let host: ReturnType<typeof Bun.spawn> | undefined
let url = ""

beforeAll(async () => {
  if (!Bun.file(executable).size) throw new Error(`OpenCode v2 executable not found: ${executable}`)
  temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "sessions-transfer-v2-discovery-"))
  configHome = path.join(temporaryRoot, "config")
  workspace = path.join(temporaryRoot, "workspace")
  await mkdir(path.join(configHome, "opencode"), { recursive: true })
  await mkdir(workspace, { recursive: true })
  await writeFile(path.join(configHome, "opencode", "opencode.jsonc"), "{}\n")
  environment = Object.fromEntries(
    Object.entries({
      ...process.env,
      OPENCODE_V1_PLUGIN_DIR: "",
      OPENCODE_V2_PLUGIN_DIR: "",
      OPENCODE_TEST_HOME: temporaryRoot,
      XDG_CONFIG_HOME: configHome,
      XDG_DATA_HOME: path.join(temporaryRoot, "data"),
      XDG_CACHE_HOME: path.join(temporaryRoot, "cache"),
      XDG_STATE_HOME: path.join(temporaryRoot, "state"),
      OPENCODE_DISABLE_AUTOUPDATE: "true",
      OPENCODE_SERVER_PASSWORD: password,
      NO_COLOR: "1",
    }).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  )
  const installed = Bun.spawn([process.execPath, "run", "install:plugin:v2"], { cwd: project, env: environment, stdout: "pipe", stderr: "pipe" })
  const [code, stdout, stderr] = await Promise.all([installed.exited, new Response(installed.stdout).text(), new Response(installed.stderr).text()])
  if (code !== 0) throw new Error(`installer failed: ${stdout}${stderr}`)

  const reservation = Bun.serve({ port: 0, fetch: () => new Response("reserved") })
  const port = reservation.port
  reservation.stop(true)
  url = `http://127.0.0.1:${port}`
  host = Bun.spawn([executable, "serve", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: workspace,
    env: environment,
    stdin: "ignore",
    stdout: "ignore",
    stderr: "ignore",
  })
  const deadline = Date.now() + 60_000
  while (!(await fetch(`${url}/api/info`).then(() => true, () => false))) {
    if (Date.now() > deadline) throw new Error("isolated OpenCode v2 host did not start")
    await Bun.sleep(100)
  }
}, 120_000)

afterAll(async () => {
  host?.kill()
  await host?.exited.catch(() => undefined)
  if (temporaryRoot && path.resolve(temporaryRoot).startsWith(path.resolve(os.tmpdir()) + path.sep)) {
    await rm(temporaryRoot, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 })
  }
}, 60_000)

async function api(route: string) {
  const child = Bun.spawn([executable, "api", route, "--server", url], { cwd: workspace, env: environment, stdout: "pipe", stderr: "pipe" })
  const [exitCode, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()])
  if (exitCode !== 0) throw new Error(`api ${route} exited ${exitCode}: ${stdout}${stderr}`)
  return stdout
}

test("real OpenCode 2.0.14 auto-discovers plugins/sessions-transfer/ with server and TUI entrypoints", async () => {
  // integration.list waits for plugin activation; plugin.list does not (measured in opencode-session-id).
  await api("integration.list")
  const listed = JSON.parse(await api("plugin.list")) as {
    data: Array<{ id?: string; source: { type: string; path?: string }; state: { status: string }; features: Record<string, boolean> }>
  }
  const ours = listed.data.find((plugin) => plugin.id === "opencode-sessions-transfer")
  expect(ours).toMatchObject({ id: "opencode-sessions-transfer", source: { type: "local" }, state: { status: "active" }, features: { tui: true } })
  expect(path.normalize(ours!.source.path!).toLowerCase()).toBe(
    path.join(configHome, "opencode", "plugins", "sessions-transfer", "server.js").toLowerCase(),
  )
}, 120_000)
