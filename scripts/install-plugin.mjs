// Installer contract shared with the mavasbel/opencode-* plugins (opencode-sessions-transfer
// scripts/install-plugin.mjs, v2 subset — this plugin has no v1 lane):
//   v2           write dist/v2 as the folder <plugins>/session-id/ (server.js + tui.js)
//   validate-v2  re-check the installed folder byte-for-byte against dist/v2 and its module shape
// <plugins> is OPENCODE_V2_PLUGIN_DIR, else $XDG_CONFIG_HOME/opencode/plugins (default
// ~/.config/opencode/plugins), where OpenCode 2.0.14 auto-discovers it. It must be a folder: v2
// resolves a TUI entrypoint only for a directory (plugin/src/host.ts:17-44); a loose file gets a server
// entrypoint alone. The installer never edits opencode.jsonc.
import { createHash } from "node:crypto"
import { copyFile, mkdir, readFile, rename } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const folder = "session-id"
const pluginId = "session-id-tool"
const artifacts = ["server.js", "tui.js"]

const command = process.argv[2]
if (!new Set(["v2", "validate-v2"]).has(command)) {
  throw new Error("usage: bun scripts/install-plugin.mjs <v2|validate-v2>")
}

const directory = path.join(pluginDirectory(), folder)
if (command === "v2") await install()
await validate()

function pluginDirectory() {
  const configured = process.env.OPENCODE_V2_PLUGIN_DIR
  if (configured) return path.resolve(configured)
  const configHome = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config")
  return path.join(configHome, "opencode", "plugins")
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex")
}

async function install() {
  await mkdir(directory, { recursive: true })
  for (const file of artifacts) {
    const target = path.join(directory, file)
    const temporary = `${target}.${process.pid}.tmp`
    await copyFile(path.join(project, "dist", "v2", file), temporary)
    await rename(temporary, target)
  }
}

async function validate() {
  const files = []
  for (const file of artifacts) {
    const [built, deployed] = await Promise.all([readFile(path.join(project, "dist", "v2", file)), readFile(path.join(directory, file))])
    if (sha256(built) !== sha256(deployed)) throw new Error(`artifact mismatch: ${file}`)
    files.push({ file, bytes: deployed.byteLength, sha256: sha256(deployed) })
  }
  const server = await import(`${pathToFileURL(path.join(directory, "server.js")).href}?validate=${Date.now()}`)
  if (server.default?.id !== pluginId || typeof server.default?.setup !== "function") {
    throw new Error("v2 server artifact does not expose the expected { id, setup } module")
  }
  // tui.js imports the host's opentui:runtime-module:* registry, which only exists inside the OpenCode
  // TUI process, so its shape is checked statically here and dynamically by tests/live/v2-artifacts.test.ts.
  const tui = await readFile(path.join(directory, "tui.js"), "utf8")
  if (!tui.includes(`"${pluginId}"`) || !/export\s*\{[^}]*\bas default\b/.test(tui)) {
    throw new Error("v2 TUI artifact does not expose the expected default { id, setup } module")
  }
  console.log(JSON.stringify({ host: "v2", directory, files, status: "valid" }))
}
