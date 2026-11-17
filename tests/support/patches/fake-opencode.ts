/**
 * A stand-in for `opencode serve`, run by the sandbox tests through a wrapper script
 * (`opencodeStandIn`): it reads the one plugin folder from `$XDG_CONFIG_HOME/opencode/opencode.jsonc`,
 * writes Magic Context's log under `$TMPDIR`, and answers `GET /api/plugin` the way OpenCode 2.1.1
 * does. The first argument picks the behaviour:
 * - `ok`: lists the plugin `active` from `<folder>/index.js` after one request, logs `v2 setup`;
 * - `reject`: as `ok`, and the log rejects `execute_threshold_percentage`;
 * - `nolog`: as `ok`, without writing any log;
 * - `missing`: never lists the plugin (and answers 503 to the first request);
 * - `silent`: prints nothing and ignores SIGTERM;
 * - `exit`: exits at once.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"

const [mode] = process.argv.slice(2)
if (mode === "exit") process.exit(0)
if (mode === "silent") {
  process.on("SIGTERM", () => {})
  setInterval(() => {}, 1000)
} else {
  const plugin = (JSON.parse(readFileSync(path.join(process.env.XDG_CONFIG_HOME!, "opencode", "opencode.jsonc"), "utf8")) as { plugins: string[] }).plugins[0]!
  const log = path.join(process.env.TMPDIR!, "opencode2", "magic-context", "magic-context.log")
  mkdirSync(path.dirname(log), { recursive: true })
  const lines = ["[2026-10-23T00:00:00.000Z] [magic-context] @cortexkit/opencode-magic-context v2 setup"]
  if (mode === "reject") lines.unshift('[2026-10-23T00:00:00.000Z] [config] config reload failed ~/.config/cortexkit/magic-context.jsonc: invalid configuration: [user config] "execute_threshold_percentage": invalid value (number 13), using default 65.')
  if (mode !== "nolog") writeFileSync(log, `${lines.join("\n")}\n`)
  let requests = 0
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      if (request.headers.get("authorization") !== `Basic ${btoa("opencode:secret")}`) return new Response("", { status: 401 })
      requests += 1
      if (mode === "missing") return requests === 1 ? new Response("", { status: 503 }) : Response.json({ location: { directory: "/w" }, data: [] })
      const data = requests === 1 ? [] : [{ id: "opencode-magic-context", source: { type: "local", path: `${plugin}/index.js` }, state: { status: "active" } }]
      return Response.json({ location: { directory: new URL(request.url).searchParams.get("directory") }, data })
    },
  })
  process.stdout.write(`server listening on http://127.0.0.1:${server.port}\nserver password secret\n`)
  process.on("SIGTERM", () => process.exit(0))
}
