import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import type { SandboxPort, SandboxProof } from "@session-manager/domain/ports/outbound/SandboxPort"
import { authorization, magicContextPlugin, type PluginAnswer } from "@session-manager/infrastructure/adapters/outbound/opencode2/OpencodeLivePluginsAdapter"

export interface SandboxOptions {
  /** The OpenCode binary, the same one the user runs. */
  readonly opencode: string
  /** Where sandbox homes are created (and removed again). */
  readonly parent: string
  /** How long the server may take to listen, and then to report the plugin. */
  readonly timeoutMs: number
  /** How long to wait after the plugin is reported before reading its log. */
  readonly settleMs: number
  readonly pollMs: number
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** The promise's value, or null when it takes longer than `ms`; the timer never outlives the race. */
async function within<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const expired = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms)
  })
  try {
    return await Promise.race([promise, expired])
  } finally {
    clearTimeout(timer)
  }
}

/** Reads the whole stream (so the child never blocks on a full pipe); resolves with the text once `done` holds, or null at its end. */
function watchFor(stream: ReadableStream<Uint8Array>, done: (text: string) => boolean): Promise<string | null> {
  return new Promise((resolve) => {
    const decoder = new TextDecoder()
    let text = ""
    let found = false
    void (async () => {
      for await (const chunk of stream) {
        if (found) continue
        text += decoder.decode(chunk, { stream: true })
        if (done(text)) {
          found = true
          resolve(text)
        }
      }
      if (!found) resolve(null)
    })()
  })
}

const ADDRESS = /^server listening on (http:\/\/127\.0\.0\.1:\d+)/m
const PASSWORD = /^server password (\S+)/m

/**
 * `opencode serve --hostname 127.0.0.1 --port 0` in a fresh home: HOME, XDG_CONFIG_HOME,
 * XDG_DATA_HOME, XDG_STATE_HOME, XDG_CACHE_HOME and TMPDIR all inside it, nothing else from the
 * environment (so no Hindsight configuration, no live log, no live database is reached). Its
 * opencode.jsonc lists only the plugin folder; its magic-context.jsonc is the user's. The server is
 * stopped and the home removed afterwards.
 */
export class OpencodeSandboxAdapter implements SandboxPort {
  constructor(private readonly options: SandboxOptions) {}

  async prove(pluginRoot: string, magicContextConfig: string | null): Promise<SandboxProof> {
    await mkdir(this.options.parent, { recursive: true })
    const home = await mkdtemp(path.join(this.options.parent, "mc-patches-sandbox-"))
    const dirs = {
      config: path.join(home, ".config"),
      data: path.join(home, ".local", "share"),
      state: path.join(home, ".local", "state"),
      cache: path.join(home, ".cache"),
      tmp: path.join(home, "tmp"),
      work: path.join(home, "work"),
    }
    for (const dir of Object.values(dirs)) await mkdir(dir, { recursive: true })
    await mkdir(path.join(dirs.config, "opencode"))
    await writeFile(path.join(dirs.config, "opencode", "opencode.jsonc"), `${JSON.stringify({ plugins: [pluginRoot] }, null, 2)}\n`)
    if (magicContextConfig !== null) {
      await mkdir(path.join(dirs.config, "cortexkit"))
      await writeFile(path.join(dirs.config, "cortexkit", "magic-context.jsonc"), magicContextConfig)
    }
    const env = {
      HOME: home,
      PATH: "/usr/bin:/bin",
      TMPDIR: dirs.tmp,
      XDG_CONFIG_HOME: dirs.config,
      XDG_DATA_HOME: dirs.data,
      XDG_STATE_HOME: dirs.state,
      XDG_CACHE_HOME: dirs.cache,
    }
    let child: ReturnType<typeof Bun.spawn> | null = null
    try {
      child = Bun.spawn([this.options.opencode, "serve", "--hostname", "127.0.0.1", "--port", "0"], {
        cwd: dirs.work,
        env,
        stdin: "ignore",
        stdout: "pipe",
        stderr: "ignore",
      })
      const printed = await within(
        watchFor(child.stdout as ReadableStream<Uint8Array>, (text) => ADDRESS.test(text) && PASSWORD.test(text)),
        this.options.timeoutMs,
      )
      if (printed === null) {
        return { status: null, source: null, lines: [], error: `opencode serve printed no address and password within ${this.options.timeoutMs} ms` }
      }
      const server = { url: ADDRESS.exec(printed)![1]!, password: PASSWORD.exec(printed)![1]! }
      const plugin = await this.plugin(server, dirs.work)
      if (plugin !== null) await sleep(this.options.settleMs)
      const log = await readFile(path.join(dirs.tmp, "opencode2", "magic-context", "magic-context.log"), "utf8").catch(() => "")
      return { status: plugin?.status ?? null, source: plugin?.source ?? null, lines: log.split("\n").filter((line) => line !== ""), error: null }
    } catch (error) {
      return { status: null, source: null, lines: [], error: (error as Error).message }
    } finally {
      if (child !== null) {
        child.kill("SIGTERM")
        if ((await within(child.exited, 10_000)) === null) child.kill("SIGKILL")
        await child.exited
      }
      await rm(home, { recursive: true, force: true })
    }
  }

  /** Polls `GET /api/plugin` until the server lists Magic Context, or the timeout passes. */
  private async plugin(server: { url: string; password: string }, work: string): Promise<{ source: string; status: string } | null> {
    const deadline = Date.now() + this.options.timeoutMs
    for (;;) {
      const response = await fetch(`${server.url}/api/plugin?directory=${encodeURIComponent(work)}`, { headers: authorization(server.password) })
      const found = response.ok ? magicContextPlugin((await response.json()) as PluginAnswer) : null
      if (found !== null) return found
      if (Date.now() >= deadline) return null
      await sleep(this.options.pollMs)
    }
  }
}
