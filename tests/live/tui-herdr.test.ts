// LIVE tier: the real OpenCode TUI, with the plugin installed as in production,
// running in a pane of a real Herdr. Herdr runs as its own headless server under
// a private XDG_CONFIG_HOME in the temporary folder, so neither the user's Herdr
// nor its configuration is touched; the OpenCode host is the isolated one of the
// other live tests. Herdr itself starts the TUI in its pane and hands it
// HERDR_ENV, HERDR_SOCKET_PATH and HERDR_PANE_ID, exactly as for the user.
//
// What is proven: Herdr recognises OpenCode in the pane, and the pane's title
// and displayed agent name become the open session's title as OpenCode stores
// it; a rename reaches the pane; quitting the TUI gives the pane back Herdr's
// defaults. OPENCODE_SM_LIVE_HERDR_BIN names the `herdr` executable to test (a
// newer release before installing it), else the one on PATH; skipped when there
// is none.
import { afterAll, beforeAll, describe, expect, it } from "bun:test"
import { mkdtemp, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { MODEL, startIsolatedHost, type IsolatedHost } from "@test/support/live/isolated-host"
import { removeTemporary, requireOpenCode, run } from "@test/support/live/process"

const executable = process.env["OPENCODE_SM_LIVE_HERDR_BIN"] || Bun.which("herdr")
const SESSION = `osm-live-${process.pid}`

let host: IsolatedHost | undefined
let herdrHome = ""
let server: ReturnType<typeof Bun.spawn> | undefined

/** The environment of every Herdr command: the private config folder, and no trace of the Herdr this test may run in. */
function herdrEnvironment(): Record<string, string> {
  const environment = Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === "string" && !entry[0].startsWith("HERDR_")),
  )
  return { ...environment, XDG_CONFIG_HOME: herdrHome }
}

async function herdr(...args: string[]) {
  const result = await run([executable!, "--session", SESSION, ...args], { env: herdrEnvironment(), timeoutMs: 30_000 })
  if (result.exitCode !== 0) throw new Error(`herdr ${args.join(" ")} failed: ${result.stdout}${result.stderr}`)
  // `pane run` and `pane send-keys` answer nothing on success.
  return (result.stdout.trim() ? JSON.parse(result.stdout) : { result: {} }) as { result: Record<string, any> }
}

interface PaneView {
  readonly agent?: string
  readonly title?: string
  readonly display_agent?: string
  readonly agent_session?: { readonly value?: string }
}

async function pane(paneID: string): Promise<PaneView> {
  return (await herdr("pane", "get", paneID)).result["pane"] as PaneView
}

async function until(paneID: string, condition: (view: PaneView) => boolean, timeoutMilliseconds = 60_000) {
  const deadline = Date.now() + timeoutMilliseconds
  let view = await pane(paneID)
  while (!condition(view)) {
    if (Date.now() > deadline) throw new Error(`timed out; the pane shows ${JSON.stringify(view)}`)
    await Bun.sleep(250)
    view = await pane(paneID)
  }
  return view
}

describe.skipIf(!executable)("real TUI in a real Herdr pane", () => {
  beforeAll(async () => {
    host = await startIsolatedHost("opencode-session-manager-herdr-")
    // Unix socket paths are limited to ~108 bytes, so Herdr's folder stays short.
    herdrHome = await mkdtemp(path.join(os.tmpdir(), "osm-h-"))
    await writeFile(path.join(herdrHome, "config.toml"), "")
    server = Bun.spawn([executable!, "--session", SESSION, "server"], {
      env: herdrEnvironment(),
      stdin: "ignore",
      stdout: "ignore",
      stderr: "ignore",
    })
    const deadline = Date.now() + 30_000
    while ((await run([executable!, "--session", SESSION, "status", "server"], { env: herdrEnvironment() })).exitCode !== 0) {
      if (Date.now() > deadline) throw new Error("the test's Herdr server did not start")
      await Bun.sleep(200)
    }
  }, 180_000)

  afterAll(async () => {
    if (executable && herdrHome) await run([executable, "session", "stop", SESSION], { env: herdrEnvironment(), timeoutMs: 30_000 })
    server?.kill()
    await server?.exited
    await host?.stop()
    await removeTemporary(herdrHome)
  }, 60_000)

  it("titles the pane with the open session's title, follows a rename, and hands the pane back on exit", async () => {
    const turn = await host!.opencode(["run", "--model", `mock/${MODEL}`, "Say hello."])
    expect(turn.exitCode).toBe(0)
    const sessionID = (await host!.sessions())[0]!.id
    const title = "Herdr pane title — live check"
    const renamed = await host!.opencode(["api", "session.update", "--param", `sessionID=${sessionID}`, "-d", JSON.stringify({ title })])
    expect({ exitCode: renamed.exitCode, output: renamed.output }).toMatchObject({ exitCode: 0 })

    // Herdr starts the TUI in its pane, which hands it the HERDR_* variables.
    const script = path.join(herdrHome, "tui.sh")
    const exports = Object.entries(host!.environment)
      .filter(([name]) => /^[A-Z_][A-Z0-9_]*$/.test(name) && !name.startsWith("HERDR_"))
      .map(([name, value]) => `export ${name}='${value.replaceAll("'", "'\\''")}'`)
    await writeFile(
      script,
      [...exports, `cd '${host!.workspace}'`, `exec '${requireOpenCode()}' -s ${sessionID} --server ${host!.url}`, ""].join("\n"),
    )
    const created = await herdr("workspace", "create", "--cwd", host!.workspace, "--label", "live", "--no-focus")
    const paneID = created.result["root_pane"].pane_id as string
    await herdr("pane", "run", paneID, `sh '${script}'`)

    const titled = await until(paneID, (view) => view.title === title)
    expect({ agent: titled.agent, title: titled.title, display_agent: titled.display_agent }).toEqual({
      agent: "opencode",
      title,
      display_agent: title,
    })

    const next = "Renamed while open"
    await host!.opencode(["api", "session.update", "--param", `sessionID=${sessionID}`, "-d", JSON.stringify({ title: next })])
    const followed = await until(paneID, (view) => view.display_agent === next)
    expect(followed.title).toBe(next)

    await herdr("pane", "send-keys", paneID, "ctrl+c")
    const released = await until(paneID, (view) => view.title === undefined && view.display_agent === undefined, 30_000)
    // Evidence line for the verification record.
    console.log(`herdr-evidence ${JSON.stringify({ sessionID, titled, followed, released })}`)
  }, 300_000)
})
