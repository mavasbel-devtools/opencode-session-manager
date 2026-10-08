import { createHash } from "node:crypto"
import { copyFile, mkdir, readFile, readdir, rename, rm, rmdir, stat } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

/**
 * Installs the plugin into an OpenCode `plugins` directory, where the host auto-discovers it.
 *
 * - v2: one folder, `session-manager/` with `server.js` and `tui.js`. A loose file only ever gets a
 *   server entrypoint; the TUI entrypoint is resolved for a directory alone (plugin/src/host.ts:17-44).
 * - v1 (1.18.32): two files, `session-manager.js` (server) and `session-manager.tui.js` ({ id, tui }).
 *   A v1 module may export server() or tui(), never both (opencode/src/plugin/shared.ts:293-295).
 *
 * One plugin owns one slot per directory: installing a lane removes this plugin's artifacts of the other
 * form, and the forms of the two plugins it replaces (opencode-session-id, opencode-sessions-transfer),
 * so a host never loads a feature twice. Only these exact names are touched, a non-empty folder is never
 * removed, and no configuration is edited — the host finds the plugin by auto-discovery.
 */
const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const pluginId = "session-manager"
const folder = "session-manager"
const dist = path.join(project, "dist")

const lanes = {
  v1: [
    // The v1 server bundle's default export is the legacy plugin function itself.
    { source: path.join(dist, "v1", "session-manager.js"), target: "session-manager.js", kind: "v1-server" },
    { source: path.join(dist, "v1", "session-manager.tui.js"), target: "session-manager.tui.js", kind: "v1-tui" },
  ],
  v2: [
    { source: path.join(dist, "v2", "server.js"), target: path.join(folder, "server.js"), kind: "v2-server" },
    { source: path.join(dist, "v2", "tui.js"), target: path.join(folder, "tui.js"), kind: "v2-tui" },
  ],
}

/** Artifacts of the plugins this one replaces; retired by either lane. */
const legacy = [
  "sessions-transfer.js",
  "sessions-transfer.tui.js",
  path.join("sessions-transfer", "server.js"),
  path.join("sessions-transfer", "tui.js"),
  path.join("session-id", "server.js"),
  path.join("session-id", "tui.js"),
]
const legacyFolders = ["sessions-transfer", "session-id"]

const command = process.argv[2]
if (!new Set(["v1", "v2", "validate-v1", "validate-v2"]).has(command)) {
  throw new Error("usage: bun scripts/install-plugin.mjs <v1|v2|validate-v1|validate-v2>")
}
const lane = command.endsWith("v1") ? "v1" : "v2"
const other = lane === "v1" ? "v2" : "v1"
const directory = pluginDirectory(lane)

if (command === "v1" || command === "v2") await install()
await validate()

/** `OPENCODE_V1_PLUGIN_DIR` / `OPENCODE_V2_PLUGIN_DIR`, defaulting to the host's global `opencode/plugins`. */
function pluginDirectory(host) {
  const configured = process.env[host === "v1" ? "OPENCODE_V1_PLUGIN_DIR" : "OPENCODE_V2_PLUGIN_DIR"]
  if (configured) return path.resolve(configured)
  const configHome = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config")
  return path.join(configHome, "opencode", "plugins")
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex")
}

async function exists(target) {
  try {
    await stat(target)
    return true
  } catch {
    return false
  }
}

async function removeIfEmpty(name) {
  const target = path.join(directory, name)
  if ((await exists(target)) && (await readdir(target)).length === 0) await rmdir(target)
}

async function install() {
  for (const file of lanes[lane]) {
    const target = path.join(directory, file.target)
    await mkdir(path.dirname(target), { recursive: true })
    const temporary = `${target}.${process.pid}.tmp`
    await copyFile(file.source, temporary)
    await rename(temporary, target)
  }
  const retired = [...lanes[other].map((file) => file.target), ...legacy]
  for (const name of retired) await rm(path.join(directory, name), { force: true })
  for (const name of lane === "v1" ? [folder, ...legacyFolders] : legacyFolders) await removeIfEmpty(name)
}

/**
 * `tui.js` of the v2 lane imports the host's `opentui:runtime-module:*` registry, which only exists inside
 * the OpenCode TUI process, so its shape is checked statically here and dynamically by the live tier.
 */
async function checkShape(file, target) {
  if (file.kind === "v2-tui") {
    const code = await readFile(target, "utf8")
    return code.includes(`"${pluginId}"`) && /export\s*\{[^}]*\bas default\b/.test(code)
  }
  const entry = (await import(`${pathToFileURL(target).href}?validate=${Date.now()}`)).default
  if (file.kind === "v1-server") return typeof entry === "function"
  if (file.kind === "v1-tui") return entry?.id === `${pluginId}-tui` && typeof entry?.tui === "function"
  return entry?.id === pluginId && typeof entry?.setup === "function"
}

async function validate() {
  const report = []
  for (const file of lanes[lane]) {
    const target = path.join(directory, file.target)
    const [built, deployed] = await Promise.all([readFile(file.source), readFile(target)])
    if (sha256(built) !== sha256(deployed)) throw new Error(`${target} differs from ${path.relative(project, file.source)}`)
    if (!(await checkShape(file, target))) throw new Error(`${target} does not expose the ${file.kind} module shape`)
    report.push({ file: path.basename(file.target), bytes: deployed.byteLength, sha256: sha256(deployed) })
  }
  for (const name of [...lanes[other].map((file) => file.target), ...legacy]) {
    if (await exists(path.join(directory, name))) {
      throw new Error(`${path.join(directory, name)} must not coexist with the ${lane} form of ${pluginId}`)
    }
  }
  // v2 reports its folder (the plugin directory the host resolves), v1 the plugins directory holding its files.
  const installed = lane === "v2" ? path.join(directory, folder) : directory
  console.log(JSON.stringify({ host: lane, directory: installed, files: report, status: "valid" }))
}
