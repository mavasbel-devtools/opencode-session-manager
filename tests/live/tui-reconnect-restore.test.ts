// LIVE tier: restore-after-reconnect guard on the real OpenCode 2.3.0 TUI.
//
// A disposable isolated host (private XDG dirs, plugin built from dist/ and
// installed as in production) fronts a fault proxy; the real TUI attaches
// through the proxy (`--server <fp> --session S`) in a pane of a real,
// private Herdr server (socket under os.tmpdir(), never the user's Herdr).
// Titles are Herdr's `terminal_title` for the pane: `OC | <title>` on the
// session route, `OpenCode` on home (spike evidence S1–S4, plan
// 2026-11-16-22-17).
//
// - it1 [UC-R1]: `stall-then-fail` → one 503 on the re-sync GET, route drops
//   home, the guard verifies (one-shot failure consumed, so verify resolves)
//   and navigates back: title returns to `OC | <title>` within WINDOW + 16 s,
//   and the proxy log shows the 503 plus a later 200 for S.
// - it2 [UC-R2N]: `pass`, user-style home via the default keybind chord
//   `ctrl+x n` sent as ONE `send-keys` call (split sends miss the leader
//   timeout) → title becomes `OpenCode` and stays it for 20 s (no reconnect,
//   so the guard stays quiet).
// - it3 [UC-R3N]: S removed beforehand via `session.remove`,
//   `stall-then-404` → the TUI starts home and stays `OpenCode` for 20 s
//   (verify would reject SessionNotFoundError → no restore).
import { afterAll, beforeAll, describe, expect, it } from "bun:test"
import { appendFile, mkdir, mkdtemp, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { startIsolatedHost, type IsolatedHost } from "@test/support/live/isolated-host"
import { removeTemporary, requireOpenCode, run } from "@test/support/live/process"
import { startFaultProxy, type FaultProxy } from "@test/support/fault-proxy"

const executable = Bun.which("herdr")
const SESSION = `osm-live-${process.pid}`
/** Reconnect-adjacency window of the guard (domain ReconnectRestore.WINDOW). */
const WINDOW_MS = 10_000
const EVIDENCE = process.env["OPENCODE_SM_EVIDENCE"] ?? path.join(os.tmpdir(), "osm-reconnect-live-evidence")

let host: IsolatedHost | undefined
let herdrHome = ""
let server: ReturnType<typeof Bun.spawn> | undefined
const panes: string[] = []
const proxies: FaultProxy[] = []

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

async function terminalTitle(paneID: string): Promise<string | null> {
  const pane = (await herdr("pane", "get", paneID)).result["pane"] as { terminal_title?: string | null }
  return pane.terminal_title ?? null
}

async function logTitle(runName: string, line: string): Promise<void> {
  await appendFile(path.join(EVIDENCE, `live-${runName}-titles.log`), `${line}\n`)
}

/** Poll `terminal_title` until `want` holds; throws on timeout. Returns the elapsed ms. */
async function untilTitle(paneID: string, runName: string, want: (title: string | null) => boolean, timeoutMs: number, pollMs = 250): Promise<number> {
  const start = Date.now()
  for (;;) {
    const title = await terminalTitle(paneID).catch(() => null)
    await logTitle(runName, `${Date.now()} title=${title}`)
    if (want(title)) return Date.now() - start
    if (Date.now() - start > timeoutMs) throw new Error(`timed out after ${timeoutMs} ms waiting for title; last=${title}`)
    await Bun.sleep(pollMs)
  }
}

async function createTitledSession(title: string): Promise<string> {
  const created = await host!.opencode(["api", "session.create", "-d", JSON.stringify({ location: { directory: host!.workspace } })])
  expect(created.exitCode).toBe(0)
  const sessionID = (JSON.parse(created.stdout) as { data: { id: string } }).data.id
  const renamed = await host!.opencode(["api", "session.update", "--param", `sessionID=${sessionID}`, "-d", JSON.stringify({ title })])
  expect({ exitCode: renamed.exitCode, output: renamed.output }).toMatchObject({ exitCode: 0 })
  return sessionID
}

async function startTuiInNewPane(sessionID: string, fpUrl: string, label: string): Promise<string> {
  const script = path.join(herdrHome, `${label}.sh`)
  const exports = Object.entries(host!.environment)
    .filter(([name]) => /^[A-Z_][A-Z0-9_]*$/.test(name) && !name.startsWith("HERDR_"))
    .map(([name, value]) => `export ${name}='${value.replaceAll("'", "'\\''")}'`)
  await writeFile(script, [...exports, `cd '${host!.workspace}'`, `exec '${requireOpenCode()}' --server ${fpUrl} --session ${sessionID}`, ""].join("\n"))
  const created = await herdr("workspace", "create", "--cwd", host!.workspace, "--label", label, "--no-focus")
  const paneID = created.result["root_pane"].pane_id as string
  await herdr("pane", "run", paneID, `sh '${script}'`)
  panes.push(paneID)
  return paneID
}

async function stopPane(paneID: string): Promise<void> {
  await herdr("pane", "send-keys", paneID, "ctrl+c").catch(() => undefined)
}

describe.skipIf(!executable)("restore after reconnect home-reset (live guard)", () => {
  beforeAll(async () => {
    await mkdir(EVIDENCE, { recursive: true })
    await writeFile(path.join(EVIDENCE, "live-it1-titles.log"), "")
    await writeFile(path.join(EVIDENCE, "live-it2-titles.log"), "")
    await writeFile(path.join(EVIDENCE, "live-it3-titles.log"), "")
    host = await startIsolatedHost("opencode-session-manager-reconnect-")
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
    for (const paneID of panes) await stopPane(paneID)
    for (const proxy of proxies) proxy.stop()
    if (executable && herdrHome) await run([executable, "session", "stop", SESSION], { env: herdrEnvironment(), timeoutMs: 30_000 })
    server?.kill()
    await server?.exited
    await host?.stop()
    await removeTemporary(herdrHome)
  }, 120_000)

  // UC-R1 is not reachable live while F11 retries the one-shot 503
  // (`tests/live/tui-resync-retry.test.ts` LR1); it stays proven in
  // `tests/component/reconnect/restore.test.ts` and
  // `tests/e2e/reconnect/restore.test.ts`.

  it("leaves a user-style home alone when no reconnect happened [UC-R2N]", async () => {
    const title = "Reconnect restore live R2"
    const expected = `OC | ${title}`
    const sessionID = await createTitledSession(title)
    const proxy = startFaultProxy({ upstream: host!.url, targetSessionID: sessionID })
    proxies.push(proxy)
    proxy.setMode("pass")
    const paneID = await startTuiInNewPane(sessionID, proxy.url, "live-r2")

    await untilTitle(paneID, "it2", (seen) => seen === expected, 90_000, 1_000)

    // Age out the TUI's initial `server.connected` (it arrives ≈ mount time;
    // a home within WINDOW of it is a specified restore, not UC-R2N). Under
    // full-tier load the mount itself is slow, so anchor the wait at the
    // observed mount, not at pane start.
    await Bun.sleep(WINDOW_MS + 2_000)

    // The default leader is ctrl+x, session.new is <leader>n: one send-keys
    // call delivers the chord (split sends miss the leader timeout).
    await herdr("pane", "send-keys", paneID, "ctrl+x", "n")
    await untilTitle(paneID, "it2", (seen) => seen === "OpenCode", 30_000)

    const settledAt = Date.now()
    const deadline = settledAt + 20_000
    while (Date.now() < deadline) {
      const seen = await terminalTitle(paneID).catch(() => null)
      await logTitle("it2", `${Date.now()} title=${seen}`)
      expect(seen).toBe("OpenCode")
      await Bun.sleep(1_000)
    }

    const bad = proxy.requests().filter((entry) => entry.status === 503 || entry.status === 404)
    expect(bad).toEqual([])

    await writeFile(path.join(EVIDENCE, "live-it2-fp.jsonl"), proxy.requests().map((entry) => JSON.stringify(entry)).join("\n") + "\n")
    console.log(`reconnect-restore-evidence ${JSON.stringify({ it: 2, sessionID, settledAt })}`)
    await stopPane(paneID)
    proxy.stop()
  }, 180_000)

  it("leaves a deleted session home when the verify 404s [UC-R3N]", async () => {
    const title = "Reconnect restore live R3"
    const sessionID = await createTitledSession(title)
    const removed = await host!.opencode(["api", "session.remove", "--param", `sessionID=${sessionID}`])
    expect(removed.exitCode).toBe(0)
    const gone = await host!.opencode(["api", "session.get", "--param", `sessionID=${sessionID}`])
    expect(gone.exitCode).not.toBe(0)

    const proxy = startFaultProxy({ upstream: host!.url, targetSessionID: sessionID })
    proxies.push(proxy)
    proxy.setMode("stall-then-404")
    const paneID = await startTuiInNewPane(sessionID, proxy.url, "live-r3")

    // A removed session never mounts its route: the TUI starts home.
    await untilTitle(paneID, "it3", (seen) => seen === "OpenCode", 90_000, 1_000)

    const settledAt = Date.now()
    const deadline = settledAt + 20_000
    while (Date.now() < deadline) {
      const seen = await terminalTitle(paneID).catch(() => null)
      await logTitle("it3", `${Date.now()} title=${seen}`)
      expect(seen).toBe("OpenCode")
      await Bun.sleep(1_000)
    }

    await writeFile(path.join(EVIDENCE, "live-it3-fp.jsonl"), proxy.requests().map((entry) => JSON.stringify(entry)).join("\n") + "\n")
    console.log(`reconnect-restore-evidence ${JSON.stringify({ it: 3, sessionID, settledAt })}`)
    await stopPane(paneID)
    proxy.stop()
  }, 180_000)
})
