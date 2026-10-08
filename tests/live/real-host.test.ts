import { afterAll, beforeAll, expect, test } from "bun:test"
import path from "node:path"
import { MODEL, startIsolatedHost, type IsolatedHost } from "@test/support/live/isolated-host"
import { requireBun, root, run } from "@test/support/live/process"

let host: IsolatedHost

beforeAll(async () => {
  host = await startIsolatedHost("opencode-session-manager-host-")
}, 180_000)

afterAll(async () => {
  await host?.stop()
}, 60_000)

test("the installed folder holds exactly the built server.js and tui.js, and the TUI paints", async () => {
  expect(path.normalize(host.pluginDirectory).toLowerCase()).toBe(
    path.join(host.environment.XDG_CONFIG_HOME!, "opencode", "plugins", "session-manager").toLowerCase(),
  )
  for (const file of ["server.js", "tui.js"]) {
    expect(await Bun.file(path.join(host.pluginDirectory, file)).bytes()).toEqual(await Bun.file(path.join(root, "dist", "v2", file)).bytes())
  }
  const loaded = await run([requireBun(), "tests/support/live/load-built-tui.ts", path.join(host.pluginDirectory, "tui.js"), "ses_installed"])
  expect(JSON.parse(loaded.stdout.trim().split("\n").at(-1)!)).toMatchObject({ isPlugin: true, prepend: "sidebar.content", line: "ses_installed" })
}, 60_000)

test("the real 2.0.14 host loads the plugin with server and TUI features", async () => {
  // plugin.list reads an inventory that stays empty until the location's first plugin activation
  // settles and does not wait for it; integration.list waits (Plugin.awaitActivation,
  // packages/server/src/handlers/integration.ts), so it is called first for the same location (cwd).
  expect((await host.opencode(["api", "integration.list"])).exitCode).toBe(0)
  const listed = await host.opencode(["api", "plugin.list"])
  expect(listed.exitCode).toBe(0)
  const response = JSON.parse(listed.stdout) as {
    data: Array<{ id?: string; source: { type: string; path?: string }; state: { status: string }; features: Record<string, boolean> }>
  }
  const ours = response.data.find((plugin) => plugin.id === "session-manager")
  expect(ours).toMatchObject({
    id: "session-manager",
    source: { type: "local" },
    state: { status: "active" },
    features: { server: true, tui: true },
  })
  // Auto-discovered folder; Host.resolve tries `server` then `index`, so the server entry is server.js.
  expect(path.normalize(ours!.source.path!).toLowerCase()).toBe(path.join(host.pluginDirectory, "server.js").toLowerCase())
}, 120_000)

test("a real model turn calls the session-id tool and gets the running session's ID", async () => {
  const turn = await host.opencode(["run", "--model", `mock/${MODEL}`, "Call the session-id tool."])
  expect({ exitCode: turn.exitCode, output: turn.output }).toMatchObject({ exitCode: 0 })
  const list = await host.sessions()
  expect(list).toHaveLength(1)
  expect(list[0]!.id).toStartWith("ses_")
  expect(host.toolResults).toEqual([list[0]!.id])
  expect(turn.output).toContain(`tool-said:${list[0]!.id}`)
}, 180_000)
