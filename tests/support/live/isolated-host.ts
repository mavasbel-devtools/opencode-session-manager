// A real OpenCode 2.0.14 host (`opencode.exe serve`) with fully isolated XDG
// config/data/cache/state, the plugin deployed exactly as in production
// (immutable release + shims over a pre-existing hand-written index.js), and a
// local OpenAI-compatible mock provider (never a paid endpoint). `stop()` kills
// only the PID this harness spawned.
import { copyFile, mkdir, mkdtemp, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { removeTemporary, requireBun, requireOpenCode, reservePort, root, run, stripAnsi } from "@test/support/live/process"

export const MODEL = "mock-model"

type ChatMessage = { role: string; content?: unknown }

export interface ShimReport {
  readonly directory: string
  readonly release: string
  readonly backup: string | null
  readonly backedUp: string[]
}

export interface IsolatedHost {
  readonly url: string
  readonly pid: number
  readonly workspace: string
  readonly environment: Record<string, string>
  readonly shims: ShimReport
  readonly toolResults: string[]
  opencode(args: string[]): Promise<{ exitCode: number; stdout: string; output: string }>
  sessions(): Promise<Array<{ readonly id: string }>>
  stop(): Promise<void>
}

function sse(chunks: unknown[]) {
  return new Response(`${chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join("")}data: [DONE]\n\n`, {
    headers: { "content-type": "text/event-stream" },
  })
}

function textOf(content: unknown): string {
  if (typeof content === "string") return content
  if (Array.isArray(content)) return content.map((part) => (typeof part === "object" && part && "text" in part ? String(part.text) : "")).join("")
  return ""
}

/** First turn: call `session-id` when offered; after a tool result: echo it as `tool-said:<result>`. */
function startMockProvider(toolResults: string[]) {
  return Bun.serve({
    port: 0,
    async fetch(request) {
      const url = new URL(request.url)
      if (url.pathname !== "/v1/chat/completions" || request.method !== "POST") return Response.json({ error: "not found" }, { status: 404 })
      const body = (await request.json()) as { messages: ChatMessage[]; tools?: Array<{ function?: { name?: string } }> }
      const base = { id: "chatcmpl-e2e", object: "chat.completion.chunk", created: Math.floor(Date.now() / 1000), model: MODEL }
      const stop = { ...base, choices: [{ index: 0, delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }
      const toolMessage = [...body.messages].reverse().find((message) => message.role === "tool")
      if (toolMessage) {
        const result = textOf(toolMessage.content)
        toolResults.push(result)
        return sse([{ ...base, choices: [{ index: 0, delta: { role: "assistant", content: `tool-said:${result}` }, finish_reason: null }] }, stop])
      }
      if (!(body.tools ?? []).some((tool) => tool.function?.name === "session-id")) {
        return sse([{ ...base, choices: [{ index: 0, delta: { role: "assistant", content: "no-session-id-tool" }, finish_reason: null }] }, stop])
      }
      const call = { index: 0, id: "call_e2e_1", type: "function", function: { name: "session-id", arguments: "{}" } }
      return sse([
        { ...base, choices: [{ index: 0, delta: { role: "assistant", tool_calls: [call] }, finish_reason: null }] },
        { ...base, choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } },
      ])
    },
  })
}

export async function startIsolatedHost(prefix: string): Promise<IsolatedHost> {
  const build = await run([requireBun(), "scripts/build.mjs"])
  if (build.exitCode !== 0) throw new Error(`build failed: ${build.stdout}${build.stderr}`)

  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), prefix))
  const pluginRoot = path.join(temporaryRoot, "v2-plugins")
  const pluginDirectory = path.join(pluginRoot, "session-id")
  await mkdir(pluginDirectory, { recursive: true })
  await copyFile(path.join(root, "tests", "support", "fixtures", "legacy-session-id-index.js"), path.join(pluginDirectory, "index.js"))
  const installEnv = { ...(process.env as Record<string, string>), OPENCODE_V2_PLUGIN_ROOT: pluginRoot }
  const installed = await run([requireBun(), "scripts/install-plugin.mjs", "v2"], { env: installEnv })
  if (installed.exitCode !== 0) throw new Error(`install failed: ${installed.stdout}${installed.stderr}`)
  const release = (JSON.parse(installed.stdout) as { release: string }).release
  const shimRun = await run([requireBun(), "scripts/install-plugin.mjs", "shims-v2"], { env: { ...installEnv, OPENCODE_V2_RELEASE_DIRECTORY: release } })
  if (shimRun.exitCode !== 0) throw new Error(`shims failed: ${shimRun.stdout}${shimRun.stderr}`)
  const shims = JSON.parse(shimRun.stdout) as ShimReport

  const toolResults: string[] = []
  const mock = startMockProvider(toolResults)
  const configHome = path.join(temporaryRoot, "config")
  await mkdir(path.join(configHome, "opencode"), { recursive: true })
  await writeFile(
    path.join(configHome, "opencode", "opencode.jsonc"),
    JSON.stringify(
      {
        plugins: [pluginDirectory],
        providers: {
          mock: {
            name: "Mock",
            package: "@ai-sdk/openai-compatible",
            settings: { baseURL: `http://127.0.0.1:${mock.port}/v1`, apiKey: "e2e-only-api-key" },
            models: { [MODEL]: { name: "Mock model", capabilities: { tools: true, input: ["text"], output: ["text"] } } },
          },
        },
      },
      null,
      2,
    ),
  )
  const workspace = path.join(temporaryRoot, "workspace")
  await mkdir(workspace, { recursive: true })
  const environment = Object.fromEntries(
    Object.entries({
      ...process.env,
      OPENCODE_TEST_HOME: temporaryRoot,
      XDG_CONFIG_HOME: configHome,
      XDG_DATA_HOME: path.join(temporaryRoot, "data"),
      XDG_CACHE_HOME: path.join(temporaryRoot, "cache"),
      XDG_STATE_HOME: path.join(temporaryRoot, "state"),
      OPENCODE_DISABLE_AUTOUPDATE: "true",
      OPENCODE_SERVER_PASSWORD: "e2e-server-password",
      NO_COLOR: "1",
    }).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  )

  const url = `http://127.0.0.1:${reservePort()}`
  const host = Bun.spawn([requireOpenCode(), "serve", "--hostname", "127.0.0.1", "--port", url.split(":").at(-1)!], {
    cwd: workspace,
    env: environment,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  })
  let output = ""
  let exitCode: number | undefined
  void Promise.all([new Response(host.stdout).text(), new Response(host.stderr).text()]).then((parts) => {
    output = parts.join("")
  })
  void host.exited.then((code) => {
    exitCode = code
  })

  const stop = async () => {
    host.kill()
    await host.exited.catch(() => undefined)
    mock.stop(true)
    await removeTemporary(temporaryRoot).catch(() => undefined)
  }

  const deadline = Date.now() + 60_000
  while (!(await fetch(`${url}/api/info`).then(() => true, () => false))) {
    if (exitCode !== undefined || Date.now() > deadline) {
      await stop()
      throw new Error(`isolated OpenCode host did not start (exit ${exitCode}): ${stripAnsi(output)}`)
    }
    await Bun.sleep(100)
  }

  return {
    url,
    pid: host.pid,
    workspace,
    environment,
    shims,
    toolResults,
    async opencode(args) {
      const result = await run([requireOpenCode(), ...args, "--server", url], { env: environment, cwd: workspace, timeoutMs: 120_000 })
      return { exitCode: result.exitCode, stdout: result.stdout, output: stripAnsi(result.stdout + result.stderr) }
    },
    async sessions() {
      // `session.list` (GET /api/session) with no project/directory filter: every session in the
      // isolated database. Measured: the CLI's `session list` (current project only) answered []
      // in some runs for a session `opencode run` had just created in the same cwd.
      const listed = await run([requireOpenCode(), "api", "session.list", "--server", url], { env: environment, cwd: workspace })
      if (listed.exitCode !== 0) throw new Error(`session.list failed: ${stripAnsi(listed.stdout + listed.stderr)}`)
      return (JSON.parse(listed.stdout) as { data: Array<{ id: string }> }).data
    },
    stop,
  }
}
