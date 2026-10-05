import { createHash } from "node:crypto"
import { copyFile, mkdir, readFile, readdir, rename, rm, rmdir, stat } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

/**
 * Installs the plugin into an OpenCode `plugins` directory, where the host auto-discovers it.
 *
 * - v1 (1.18.32): two files, `sessions-transfer.js` (server) and `sessions-transfer.tui.js` ({ id, tui }).
 *   A v1 module may export server() or tui(), never both (opencode/src/plugin/shared.ts:293-295 at v1.18.32).
 * - v2 (2.0.14): one folder, `sessions-transfer/` with `server.js` and `tui.js`. A loose file only ever gets
 *   a server entrypoint; the TUI entrypoint is resolved for a directory alone (plugin/src/host.ts:17-44),
 *   and the TUI is this plugin's whole feature.
 *
 * One plugin owns one slot per directory: installing a lane removes this plugin's artifacts of the other
 * form (only these exact names), so a v2 host never loads both. Nothing else is written and no
 * configuration is edited — the host finds the plugin by auto-discovery.
 */
const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const pluginId = "opencode-sessions-transfer"
const folder = "sessions-transfer"
const lanes = {
  v1: {
    files: [
      // The v1 server bundle's default export is the legacy plugin function itself.
      { source: path.join(project, "dist", "sessions-transfer.js"), target: "sessions-transfer.js", check: (entry) => typeof entry === "function", shape: "a default plugin function" },
      { source: path.join(project, "dist", "sessions-transfer.tui.js"), target: "sessions-transfer.tui.js", check: (entry) => entry?.id === `${pluginId}-tui` && typeof entry?.tui === "function", shape: `{ id: "${pluginId}-tui", tui }` },
    ],
  },
  v2: {
    files: [
      { source: path.join(project, "dist", "v2", "server.js"), target: path.join(folder, "server.js"), check: (entry) => entry?.id === pluginId && typeof entry?.setup === "function", shape: `{ id: "${pluginId}", setup }` },
      { source: path.join(project, "dist", "v2", "tui.js"), target: path.join(folder, "tui.js"), check: (entry) => entry?.id === pluginId && typeof entry?.setup === "function", shape: `{ id: "${pluginId}", setup }` },
    ],
  },
}

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

async function install() {
  for (const file of lanes[lane].files) {
    const target = path.join(directory, file.target)
    await mkdir(path.dirname(target), { recursive: true })
    const temporary = `${target}.${process.pid}.tmp`
    await copyFile(file.source, temporary)
    await rename(temporary, target)
  }
  // Retire the other form of this same plugin (exact names only; a non-empty folder is never removed).
  for (const file of lanes[other].files) await rm(path.join(directory, file.target), { force: true })
  if (other === "v2" && (await exists(path.join(directory, folder))) && (await readdir(path.join(directory, folder))).length === 0) {
    await rmdir(path.join(directory, folder))
  }
}

async function validate() {
  const report = []
  for (const file of lanes[lane].files) {
    const target = path.join(directory, file.target)
    const [built, deployed] = await Promise.all([readFile(file.source), readFile(target)])
    if (sha256(built) !== sha256(deployed)) throw new Error(`${target} differs from ${path.relative(project, file.source)}`)
    const module = await import(`${pathToFileURL(target).href}?validate=${Date.now()}`)
    if (!file.check(module.default)) throw new Error(`${target} must export ${file.shape}`)
    report.push({ file: file.target, bytes: deployed.byteLength, sha256: sha256(deployed) })
  }
  for (const file of lanes[other].files) {
    if (await exists(path.join(directory, file.target))) {
      throw new Error(`${path.join(directory, file.target)} (${other} form) must not coexist with the ${lane} form`)
    }
  }
  console.log(JSON.stringify({ host: lane, directory, files: report, status: "valid" }))
}
