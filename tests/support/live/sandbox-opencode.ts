import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { requireOpenCode } from "@test/support/live/process"

/** A sandboxed OpenCode: its own data, state, cache and config folders under one directory. */
export function sandboxEnvironment(sandbox: string): Record<string, string | undefined> {
  return {
    ...process.env,
    XDG_DATA_HOME: join(sandbox, "data"),
    XDG_STATE_HOME: join(sandbox, "state"),
    XDG_CACHE_HOME: join(sandbox, "cache"),
    XDG_CONFIG_HOME: join(sandbox, "config"),
  }
}

export interface SandboxServer {
  readonly url: string
  readonly password: string
  /** A GET on the server's API with its password; the response's JSON. */
  get(path: string): Promise<{ readonly status: number; readonly body: unknown }>
  stop(): Promise<void>
}

/** A sandboxed `opencode serve` on the sandbox's stores, recorded in its service.json as the service records itself. */
export async function serveSandbox(sandbox: string): Promise<SandboxServer> {
  const port = 49_000 + Math.floor(Math.random() * 900)
  const child = Bun.spawn([requireOpenCode(), "serve", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: sandbox,
    env: sandboxEnvironment(sandbox),
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  })
  const reader = child.stdout.getReader()
  let text = ""
  const deadline = Date.now() + 60_000
  while (!/server password (\S+)/.test(text) || !text.includes("server listening")) {
    if (Date.now() > deadline) throw new Error(`opencode serve did not start:\n${text}`)
    const { value, done } = await reader.read()
    if (done) throw new Error(`opencode serve exited:\n${text}`)
    text += new TextDecoder().decode(value)
  }
  reader.releaseLock()
  const password = text.match(/server password (\S+)/)![1]!
  const url = `http://127.0.0.1:${port}`
  mkdirSync(join(sandbox, "state", "opencode"), { recursive: true })
  writeFileSync(join(sandbox, "state", "opencode", "service.json"), JSON.stringify({ url, password }))
  const authorization = `Basic ${Buffer.from(`opencode:${password}`).toString("base64")}`
  return {
    url,
    password,
    get: async (path) => {
      const response = await fetch(`${url}${path}`, { headers: { Authorization: authorization } })
      return { status: response.status, body: await response.json() }
    },
    stop: async () => {
      child.kill()
      await child.exited
    },
  }
}
