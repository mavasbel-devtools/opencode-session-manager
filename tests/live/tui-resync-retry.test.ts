// LIVE tier: F11 — the re-sync retry — on the real OpenCode 2.3.0 TUI.
//
// Same harness as `tui-reconnect-restore.test.ts`: a disposable isolated host
// (private XDG dirs, the plugin built from `dist/` and installed as in
// production) fronts a fault proxy; the real TUI attaches through the proxy
// (`--server <fp> --session S`) in a pane of a real, private Herdr server
// (socket under os.tmpdir(), never the user's Herdr). Titles are Herdr's
// `terminal_title` for the pane: `OC | <title>` on the session route,
// `OpenCode` on home (spike evidence S1–S4, plan 2026-11-16-22-17; re-measured
// for F11 in the 2026-11-18 spike, `{E}/spike/SUMMARY.md`).
//
// The helpers below are copied file-locally from that suite on purpose: the
// hex plan owns the test-support moves, so this step creates this one file.
//
// - LR1 [UC-RR1][UC-RR11]: `stall-then-fail` → exactly one 503 on the re-sync
//   GET `/api/session/<S>`, a later 200 for it, 0 `OpenCode` title samples
//   from mount to (503 + 60 s), and no restore toast on the +1 s / +3 s
//   screens. The stock TUI never reaches home because the retry kept the call
//   alive.
// - LR2 [UC-RR3N][UC-RR4N]: `stall` from the mount, the session deleted
//   directly upstream, then `stall-then-404` → the 404 is not retried (no 200
//   after it and no further target GET) and the title is `OpenCode` within
//   5 s. A missing session is final. The guard's own verify then 404s from
//   upstream (the same shape the 2026-11-17 `it4` measured).
// - LR3 [UC-RR2]: `stall-then-hold` holds the re-sync GET open; the proxy is
//   stopped when that GET is logged, and 3 s later restarted on the same port
//   in `pass` → 0 `OpenCode` samples through restart + 60 s and a 200 for the
//   target after the restart.
// - LR4 [UC-RR6N]: as LR3 with a 25 s hold, so the retries run out (15.5 s)
//   while the session is loaded: the call resolves, the route stays.
import { afterAll, beforeAll, describe, expect, it } from "bun:test"
import { appendFile, mkdir, mkdtemp, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { startIsolatedHost, type IsolatedHost } from "@test/support/live/isolated-host"
import { removeTemporary, requireOpenCode, run } from "@test/support/live/process"
import { startFaultProxy, type FaultProxy, type FaultRequest } from "@test/support/fault-proxy"

const executable = Bun.which("herdr")
const SESSION = `osm-live-${process.pid}`
const EVIDENCE = process.env["OPENCODE_SM_EVIDENCE"] ?? path.join(os.tmpdir(), "osm-resync-live-evidence")

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

/** The visible screen of a pane, for the toast assertions (Herdr 0.9.5 has no `pane screen`). */
async function readScreen(paneID: string): Promise<string> {
  const result = await run(
    [executable!, "--session", SESSION, "pane", "read", paneID, "--lines", "40", "--source", "visible", "--format", "text"],
    { env: herdrEnvironment(), timeoutMs: 30_000 },
  )
  if (result.exitCode !== 0) throw new Error(`herdr pane read failed: ${result.stdout}${result.stderr}`)
  return result.stdout
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

/** Poll the proxy log until an entry matches; throws on timeout with the whole log. */
async function untilRequest(proxy: FaultProxy, want: (entry: FaultRequest) => boolean, timeoutMs: number, pollMs = 500): Promise<FaultRequest> {
  const start = Date.now()
  for (;;) {
    const hit = proxy.requests().find(want)
    if (hit !== undefined) return hit
    if (Date.now() - start > timeoutMs) throw new Error(`timed out after ${timeoutMs} ms; requests=${JSON.stringify(proxy.requests())}`)
    await Bun.sleep(pollMs)
  }
}

/** Samples `terminal_title` every ~250 ms in the background until `stop()`. */
function startSampling(paneID: string, runName: string) {
  const samples: Array<{ ts: number; title: string | null }> = []
  let stopped = false
  const done = (async () => {
    while (!stopped) {
      const ts = Date.now()
      const title = await terminalTitle(paneID).catch(() => null)
      samples.push({ ts, title })
      await logTitle(runName, `${ts} title=${title}`)
      if (!stopped) await Bun.sleep(250)
    }
    return samples
  })()
  return {
    samples,
    async stop() {
      stopped = true
      await done
    },
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

/** The proxy port of a running proxy (`<fp>` is its URL). */
function portOf(proxy: FaultProxy): number {
  return Number(new URL(proxy.url).port)
}

/** Appends one line per scenario to the run's `run.info`: `<P>` and `<fp>`, plus what the run did. */
async function recordRun(info: Record<string, unknown>): Promise<void> {
  await appendFile(path.join(EVIDENCE, "run.info"), `${JSON.stringify(info)}\n`)
}

/**
 * Restart the proxy on the same port. A port released a moment ago can still
 * be busy, so this retries every 1 s for 10 s and reports how many attempts it
 * took (the run record keeps that number).
 */
async function restartProxyOnPort(upstream: string, targetSessionID: string, port: number): Promise<{ proxy: FaultProxy; attempts: number }> {
  const deadline = Date.now() + 10_000
  let attempts = 0
  for (;;) {
    attempts += 1
    try {
      return { proxy: startFaultProxy({ upstream, targetSessionID, port }), attempts }
    } catch (error) {
      if (Date.now() >= deadline) throw new Error(`proxy port ${port} still busy after ${attempts} attempt(s): ${String(error)}`)
      await Bun.sleep(1_000)
    }
  }
}

function writeRequests(name: string, entries: ReadonlyArray<FaultRequest>): Promise<void> {
  return writeFile(path.join(EVIDENCE, `live-${name}-fp.jsonl`), entries.map((entry) => JSON.stringify(entry)).join("\n") + "\n")
}

describe.skipIf(!executable)("re-sync retry keeps the session open (live)", () => {
  beforeAll(async () => {
    await mkdir(EVIDENCE, { recursive: true })
    for (const name of ["lr1", "lr2", "lr3", "lr4"]) await writeFile(path.join(EVIDENCE, `live-${name}-titles.log`), "")
    await writeFile(path.join(EVIDENCE, "run.info"), "")
    host = await startIsolatedHost("opencode-session-manager-resync-")
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

  it("LR1 [UC-RR1][UC-RR11] keeps the session open across a one-shot 503", async () => {
    const title = "Resync retry live LR1"
    const expected = `OC | ${title}`
    const sessionID = await createTitledSession(title)
    const proxy = startFaultProxy({ upstream: host!.url, targetSessionID: sessionID })
    proxies.push(proxy)
    // Start stalled (initial REST syncs pass, only the event stream stalls),
    // wait for a stable session route, then arm the one-shot 503 — exactly the
    // spike shape. Arming first would spend the 503 on the initial session
    // load and the TUI would start home.
    proxy.setMode("stall")
    const paneID = await startTuiInNewPane(sessionID, proxy.url, "live-lr1")
    const targetPath = `/api/session/${sessionID}`
    const sampler = startSampling(paneID, "lr1")

    try {
      await untilTitle(paneID, "lr1", (seen) => seen === expected, 90_000, 1_000)
      const mountedAt = Date.now()
      await logTitle("lr1", `${mountedAt} mounted`)
      proxy.setMode("stall-then-fail")
      await logTitle("lr1", `${Date.now()} armed-stall-then-fail`)

      // The 45 s watchdog fires on the stalled stream; the reconnect's re-sync
      // GET fails once with 503 and F11 retries it.
      const failed = await untilRequest(proxy, (entry) => entry.method === "GET" && entry.path === targetPath && entry.status === 503, 150_000)
      const failedAt = failed.ts
      await logTitle("lr1", `${Date.now()} fp-503 ts=${failedAt}`)

      // The retry (500 ms first backoff) must resolve against the server.
      const later200 = await untilRequest(proxy, (entry) => entry.method === "GET" && entry.path === targetPath && entry.status === 200 && entry.ts > failedAt, 30_000)
      await logTitle("lr1", `${Date.now()} fp-200 ts=${later200.ts}`)

      // The stock TUI shows its error toast and navigates home on the re-sync
      // rejection; F11 keeps the call alive, so both screens stay on the route.
      await Bun.sleep(Math.max(0, failedAt + 1_000 - Date.now()))
      const screenPlus1 = await readScreen(paneID)
      await writeFile(path.join(EVIDENCE, "live-lr1-screen-plus1s.txt"), screenPlus1)
      await logTitle("lr1", `${Date.now()} screen-plus1s`)
      await Bun.sleep(Math.max(0, failedAt + 3_000 - Date.now()))
      const screenPlus3 = await readScreen(paneID)
      await writeFile(path.join(EVIDENCE, "live-lr1-screen-plus3s.txt"), screenPlus3)
      await logTitle("lr1", `${Date.now()} screen-plus3s`)

      // Observe the whole window the brief names: mount → (503 + 60 s).
      const deadline = failedAt + 60_000
      while (Date.now() < deadline) await Bun.sleep(500)
      await sampler.stop()

      // Sampling starts before mount, where the TUI still carries its own default `OpenCode` title;
      // the window these scenarios name begins at mount, so a pre-mount sample is not a home navigation.
      const openCodeSamples = sampler.samples.filter((sample) => sample.ts >= mountedAt && sample.title === "OpenCode")
      const targetGets = proxy.requests().filter((entry) => entry.method === "GET" && entry.path === targetPath)
      expect({
        openCodeSamples: openCodeSamples.map((sample) => sample.ts),
        failures: targetGets.filter((entry) => entry.status === 503).length,
        later200: later200.ts,
        samples: sampler.samples.length,
      }).toMatchObject({ openCodeSamples: [], failures: 1 })
      expect(sampler.samples.length).toBeGreaterThan(0)
      expect(screenPlus1).not.toContain("Session restored")
      expect(screenPlus1).not.toContain("Session unavailable")
      expect(screenPlus3).not.toContain("Session restored")
      expect(screenPlus3).not.toContain("Session unavailable")

      await writeRequests("lr1", proxy.requests())
      await recordRun({ lr: "LR1", ts: Date.now(), sessionID, port: portOf(proxy), fp: proxy.url, mountedAt, failedAt, retry200At: later200.ts, samples: sampler.samples.length, openCodeSamples: openCodeSamples.length, screens: ["live-lr1-screen-plus1s.txt", "live-lr1-screen-plus3s.txt"] })
      console.log(`resync-retry-evidence ${JSON.stringify({ lr: 1, sessionID, mountedAt, failedAt, retry200At: later200.ts, samples: sampler.samples.length, openCodeSamples: openCodeSamples.length })}`)
    } finally {
      await sampler.stop().catch(() => undefined)
      await stopPane(paneID)
      proxy.stop()
    }
  }, 400_000)

  it("LR2 [UC-RR3N][UC-RR4N] treats a missing session as final after one 404", async () => {
    const title = "Resync retry live LR2"
    const expected = `OC | ${title}`
    const sessionID = await createTitledSession(title)
    const proxy = startFaultProxy({ upstream: host!.url, targetSessionID: sessionID })
    proxies.push(proxy)
    proxy.setMode("stall")
    const paneID = await startTuiInNewPane(sessionID, proxy.url, "live-lr2")
    const targetPath = `/api/session/${sessionID}`

    try {
      await untilTitle(paneID, "lr2", (seen) => seen === expected, 90_000, 1_000)
      const mountedAt = Date.now()
      await logTitle("lr2", `${mountedAt} mounted`)

      // Arm exactly one 404, then remove the session upstream. While the stream
      // is stalled no `session.deleted` can reach the TUI, so the re-sync is the
      // first thing to learn the session is gone.
      proxy.setMode("stall-then-404")
      const removed = await host!.opencode(["api", "session.remove", "--param", `sessionID=${sessionID}`])
      expect(removed.exitCode).toBe(0)
      const removedAt = Date.now()
      await logTitle("lr2", `${removedAt} removed`)

      // The reconnect's re-sync eats the one-shot 404; a missing session is
      // final, so F11 rethrows at once and the stock effect goes home.
      const failed = await untilRequest(proxy, (entry) => entry.method === "GET" && entry.path === targetPath && entry.status === 404, 150_000)
      await logTitle("lr2", `${Date.now()} fp-404 ts=${failed.ts}`)
      await untilTitle(paneID, "lr2", (seen) => seen === "OpenCode", 5_000)
      const wentHomeAt = Date.now()
      expect(wentHomeAt - failed.ts).toBeLessThanOrEqual(5_000)
      await logTitle("lr2", `${wentHomeAt} home-observed +${wentHomeAt - failed.ts}ms`)

      // A missing session is final: the title stays home.
      await Bun.sleep(3_000)
      expect(await terminalTitle(paneID)).toBe("OpenCode")

      const targetGets = proxy.requests().filter((entry) => entry.method === "GET" && entry.path === targetPath)
      const four04s = targetGets.filter((entry) => entry.status === 404)
      // The one-shot 404 (the re-sync) plus the guard's own verify, which the
      // proxy forwards to upstream and which 404s there (the 2026-11-17 `it4`
      // measured the same pair). A retry would add one GET per backoff
      // (500/1500/3500 ms) — none exists, and none succeeded.
      expect(targetGets.filter((entry) => entry.ts > failed.ts && entry.status === 200)).toEqual([])
      expect(targetGets.filter((entry) => entry.ts > failed.ts + 1_000)).toEqual([])
      expect(four04s.length).toBe(2)

      await writeRequests("lr2", proxy.requests())
      await recordRun({ lr: "LR2", ts: Date.now(), sessionID, port: portOf(proxy), fp: proxy.url, mountedAt, removedAt, first404At: failed.ts, wentHomeAt, homeDelayMs: wentHomeAt - failed.ts, four04s: four04s.length })
      console.log(`resync-retry-evidence ${JSON.stringify({ lr: 2, sessionID, first404At: failed.ts, wentHomeAt, homeDelayMs: wentHomeAt - failed.ts, four04s: four04s.length })}`)
    } finally {
      await stopPane(paneID)
      proxy.stop()
    }
  }, 300_000)

  it("LR3 [UC-RR2] retries a held re-sync across a 3 s proxy outage", async () => {
    const title = "Resync retry live LR3"
    const expected = `OC | ${title}`
    const sessionID = await createTitledSession(title)
    const proxy = startFaultProxy({ upstream: host!.url, targetSessionID: sessionID })
    proxies.push(proxy)
    proxy.setMode("stall")
    const paneID = await startTuiInNewPane(sessionID, proxy.url, "live-lr3")
    const targetPath = `/api/session/${sessionID}`
    const port = portOf(proxy)
    const sampler = startSampling(paneID, "lr3")

    try {
      await untilTitle(paneID, "lr3", (seen) => seen === expected, 90_000, 1_000)
      const mountedAt = Date.now()
      await logTitle("lr3", `${mountedAt} mounted`)

      // Hold the reconnect's re-sync GET open forever: stopping the proxy then
      // drops it at the socket, a real transport failure (status 0, no HTTP
      // answer) — the shape UC-RR2 exists for.
      proxy.setMode("stall-then-hold")
      const held = await untilRequest(proxy, (entry) => entry.method === "GET" && entry.path === targetPath && entry.status === 0, 150_000)
      await logTitle("lr3", `${Date.now()} fp-held ts=${held.ts}`)
      const heldRequests = [...proxy.requests()]
      proxy.stop()
      const outageAt = Date.now()

      await Bun.sleep(3_000)
      const { proxy: restarted, attempts } = await restartProxyOnPort(host!.url, sessionID, port)
      proxies.push(restarted)
      restarted.setMode("pass")
      const restartAt = Date.now()
      await logTitle("lr3", `${restartAt} proxy-restarted port=${port} attempts=${attempts}`)

      const later200 = await untilRequest(restarted, (entry) => entry.method === "GET" && entry.path === targetPath && entry.status === 200, 60_000)
      await logTitle("lr3", `${Date.now()} fp-200 ts=${later200.ts}`)

      const deadline = restartAt + 60_000
      while (Date.now() < deadline) await Bun.sleep(500)
      await sampler.stop()

      // Sampling starts before mount, where the TUI still carries its own default `OpenCode` title;
      // the window these scenarios name begins at mount, so a pre-mount sample is not a home navigation.
      const openCodeSamples = sampler.samples.filter((sample) => sample.ts >= mountedAt && sample.title === "OpenCode")
      expect({ openCodeSamples: openCodeSamples.map((sample) => sample.ts), later200: later200.ts, samples: sampler.samples.length }).toMatchObject({ openCodeSamples: [] })
      expect(sampler.samples.length).toBeGreaterThan(0)

      await writeRequests("lr3-held", heldRequests)
      await writeRequests("lr3-restarted", restarted.requests())
      await recordRun({ lr: "LR3", ts: Date.now(), sessionID, port, fp: proxy.url, mountedAt, heldAt: held.ts, outageAt, restartAt, restartAttempts: attempts, restartedPort: portOf(restarted), retry200At: later200.ts, samples: sampler.samples.length, openCodeSamples: openCodeSamples.length })
      console.log(`resync-retry-evidence ${JSON.stringify({ lr: 3, sessionID, port, heldAt: held.ts, restartAt, attempts, retry200At: later200.ts, samples: sampler.samples.length, openCodeSamples: openCodeSamples.length })}`)
    } finally {
      await sampler.stop().catch(() => undefined)
      await stopPane(paneID)
      proxy.stop()
    }
  }, 400_000)

  it("LR4 [UC-RR6N] survives a 25 s outage when the retries run out", async () => {
    const title = "Resync retry live LR4"
    const expected = `OC | ${title}`
    const sessionID = await createTitledSession(title)
    const proxy = startFaultProxy({ upstream: host!.url, targetSessionID: sessionID })
    proxies.push(proxy)
    proxy.setMode("stall")
    const paneID = await startTuiInNewPane(sessionID, proxy.url, "live-lr4")
    const targetPath = `/api/session/${sessionID}`
    const port = portOf(proxy)
    const sampler = startSampling(paneID, "lr4")

    try {
      await untilTitle(paneID, "lr4", (seen) => seen === expected, 90_000, 1_000)
      const mountedAt = Date.now()
      await logTitle("lr4", `${mountedAt} mounted`)

      // Same hold as LR3, but longer than the retry budget (six attempts over
      // 15.5 s): the retries run out while the session is loaded, so UC-RR6N's
      // "resolve, keep the route" branch applies.
      proxy.setMode("stall-then-hold")
      const held = await untilRequest(proxy, (entry) => entry.method === "GET" && entry.path === targetPath && entry.status === 0, 150_000)
      await logTitle("lr4", `${Date.now()} fp-held ts=${held.ts}`)
      const heldRequests = [...proxy.requests()]
      proxy.stop()
      const outageAt = Date.now()

      await Bun.sleep(25_000)
      const { proxy: restarted, attempts } = await restartProxyOnPort(host!.url, sessionID, port)
      proxies.push(restarted)
      restarted.setMode("pass")
      const restartAt = Date.now()
      await logTitle("lr4", `${restartAt} proxy-restarted port=${port} attempts=${attempts}`)

      // The exhausted call resolved with the route kept; the reconnect after
      // the restart re-syncs again and this one is a first attempt (200).
      const later200 = await untilRequest(restarted, (entry) => entry.method === "GET" && entry.path === targetPath && entry.status === 200, 60_000)
      await logTitle("lr4", `${Date.now()} fp-200 ts=${later200.ts}`)

      const deadline = restartAt + 60_000
      while (Date.now() < deadline) await Bun.sleep(500)
      await sampler.stop()

      // Sampling starts before mount, where the TUI still carries its own default `OpenCode` title;
      // the window these scenarios name begins at mount, so a pre-mount sample is not a home navigation.
      const openCodeSamples = sampler.samples.filter((sample) => sample.ts >= mountedAt && sample.title === "OpenCode")
      expect({ openCodeSamples: openCodeSamples.map((sample) => sample.ts), later200: later200.ts, samples: sampler.samples.length }).toMatchObject({ openCodeSamples: [] })
      expect(sampler.samples.length).toBeGreaterThan(0)

      await writeRequests("lr4-held", heldRequests)
      await writeRequests("lr4-restarted", restarted.requests())
      await recordRun({ lr: "LR4", ts: Date.now(), sessionID, port, fp: proxy.url, mountedAt, heldAt: held.ts, outageAt, restartAt, restartAttempts: attempts, restartedPort: portOf(restarted), retry200At: later200.ts, samples: sampler.samples.length, openCodeSamples: openCodeSamples.length })
      console.log(`resync-retry-evidence ${JSON.stringify({ lr: 4, sessionID, port, heldAt: held.ts, restartAt, attempts, retry200At: later200.ts, samples: sampler.samples.length, openCodeSamples: openCodeSamples.length })}`)
    } finally {
      await sampler.stop().catch(() => undefined)
      await stopPane(paneID)
      proxy.stop()
    }
  }, 400_000)
})
