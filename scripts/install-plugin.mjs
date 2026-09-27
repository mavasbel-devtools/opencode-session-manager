// v2 installer contract shared with the mavasbel/opencode-* plugins
// (opencode-sessions-transfer scripts/install-plugin.mjs, v2 subset):
//   v2           stage dist/v2 as an immutable, content-addressed release
//   validate-v2  re-hash one exact release and re-check its module shape
//   shims-v2     point <root>/<pluginName>/{index,tui}.js at one validated release,
//                backing up any existing shim files first
//   deploy-v2    stage a release and point the shims at it, in one step
// Installers never choose a profile and never edit opencode.jsonc: the plugin
// root always comes from OPENCODE_V2_PLUGIN_DIR / OPENCODE_V2_PLUGIN_ROOT.
import { createHash } from "node:crypto"
import { copyFile, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const pluginName = "session-id"
const pluginId = "session-id-tool"
const v2Artifacts = [
  { source: path.join(project, "dist", "v2", "server.js"), target: "server.js" },
  { source: path.join(project, "dist", "v2", "tui.js"), target: "tui.js" },
]
const shimFiles = [
  { shim: "index.js", artifact: "server.js" },
  { shim: "tui.js", artifact: "tui.js" },
]

const command = process.argv[2]
if (!new Set(["v2", "validate-v2", "shims-v2", "deploy-v2"]).has(command)) {
  throw new Error("usage: bun scripts/install-plugin.mjs <v2|validate-v2|shims-v2|deploy-v2>")
}

if (command === "v2") console.log(JSON.stringify(await installV2(), null, 2))
if (command === "validate-v2") await validateV2()
if (command === "shims-v2") console.log(JSON.stringify(await shimsV2(v2ReleaseDirectory()), null, 2))
if (command === "deploy-v2") await deployV2()

function sha256(value) {
  return createHash("sha256").update(value).digest("hex")
}

async function fileRecord(source, target) {
  const bytes = await readFile(source)
  return { file: target, bytes: bytes.byteLength, sha256: sha256(bytes) }
}

function v2PluginRoot() {
  const value = process.env.OPENCODE_V2_PLUGIN_DIR ?? process.env.OPENCODE_V2_PLUGIN_ROOT
  if (!value) {
    throw new Error(
      "OPENCODE_V2_PLUGIN_DIR (or OPENCODE_V2_PLUGIN_ROOT) is required; installers never choose or edit a global OpenCode profile",
    )
  }
  return path.resolve(value)
}

function v2ReleaseDirectory() {
  const value = process.env.OPENCODE_V2_RELEASE_DIRECTORY
  if (!value) throw new Error("OPENCODE_V2_RELEASE_DIRECTORY is required to validate one immutable v2 release")
  return path.resolve(value)
}

async function atomicText(target, value) {
  const temporary = `${target}.${process.pid}.tmp`
  await writeFile(temporary, value)
  await rename(temporary, target)
}

async function atomicCopy(source, target) {
  const temporary = `${target}.${process.pid}.tmp`
  await copyFile(source, temporary)
  await rename(temporary, target)
}

async function exists(file) {
  return stat(file).then(
    () => true,
    () => false,
  )
}

async function installV2() {
  for (const entry of v2Artifacts) await stat(entry.source)
  const root = path.join(v2PluginRoot(), pluginName)
  const records = await Promise.all(v2Artifacts.map((entry) => fileRecord(entry.source, entry.target)))
  const releaseHash = sha256(JSON.stringify(records))
  const release = path.join(root, "releases", `sha256-${releaseHash}`)
  await mkdir(release, { recursive: true })
  for (const entry of v2Artifacts) await atomicCopy(entry.source, path.join(release, entry.target))
  await assertModuleShapes(release)
  const releaseManifest = {
    ...(await manifest(records, { moduleShape: "passed", isolatedHost: "not-run" })),
    releaseHash,
  }
  await atomicText(path.join(release, "manifest.json"), `${JSON.stringify(releaseManifest, null, 2)}\n`)
  return { host: "v2", root, release, manifest: releaseManifest }
}

/**
 * The deployment step: one command that stages the current build as an immutable
 * release and points the plugin directory's shims at it. It replaces the
 * machine-specific batch file kept for the record in docs/reference of the
 * operator's notes. It still refuses to pick the plugin root itself.
 */
async function deployV2() {
  const staged = await installV2()
  const shims = await shimsV2(staged.release)
  console.log(JSON.stringify({ host: "v2", staged, shims }, null, 2))
}

async function validateV2() {
  const release = v2ReleaseDirectory()
  await validateRelease(release)
  console.log(JSON.stringify({ host: "v2", release, status: "valid" }))
}

async function validateRelease(release) {
  const expectedRoot = `${path.join(v2PluginRoot(), pluginName, "releases")}${path.sep}`
  if (!release.startsWith(expectedRoot)) throw new Error("v2 release is outside its configured immutable release root")
  const releaseManifest = JSON.parse(await readFile(path.join(release, "manifest.json"), "utf8"))
  for (const artifact of releaseManifest.artifacts) {
    const actual = await fileRecord(path.join(release, artifact.file), artifact.file)
    if (actual.bytes !== artifact.bytes || actual.sha256 !== artifact.sha256) throw new Error(`artifact mismatch: ${artifact.file}`)
  }
  await assertModuleShapes(release)
}

async function assertModuleShapes(release) {
  const server = await import(`${pathToFileURL(path.join(release, "server.js")).href}?validate=${Date.now()}`)
  if (server.default?.id !== pluginId || typeof server.default?.setup !== "function") {
    throw new Error("v2 server artifact does not expose the expected { id, setup } module")
  }
  // tui.js imports the host's opentui:runtime-module:* registry, which only exists
  // inside the OpenCode TUI process, so its shape is checked statically here and
  // dynamically by tests/e2e/v2-artifacts.test.ts under the host's runtime support.
  const tui = await readFile(path.join(release, "tui.js"), "utf8")
  if (!tui.includes(`"${pluginId}"`) || !/export\s*\{[^}]*\bas default\b/.test(tui)) {
    throw new Error("v2 TUI artifact does not expose the expected default { id, setup } module")
  }
}

async function shimsV2(release) {
  await validateRelease(release)
  const directory = path.join(v2PluginRoot(), pluginName)
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..*/, "")
  const backup = path.join(directory, `backup-${stamp}`)
  const backedUp = []
  for (const { shim } of shimFiles) {
    const file = path.join(directory, shim)
    if (!(await exists(file))) continue
    await mkdir(backup, { recursive: true })
    await copyFile(file, path.join(backup, shim))
    backedUp.push(shim)
  }
  const written = []
  for (const { shim, artifact } of shimFiles) {
    const target = pathToFileURL(path.join(release, artifact)).href
    await atomicText(path.join(directory, shim), `export { default } from ${JSON.stringify(target)}\n`)
    written.push({ shim, target })
  }
  return { host: "v2", directory, release, backup: backedUp.length ? backup : null, backedUp, written }
}

async function manifest(artifacts, validation) {
  const lockfile = await fileRecord(path.join(project, "bun.lock"), "bun.lock")
  const head = git("rev-parse", "HEAD")
  const status = git("status", "--porcelain")
  return {
    schema: 1,
    host: "v2.0.14",
    contracts: { v2: "2.0.14" },
    pluginName,
    pluginId,
    source: { repository: await exists(path.join(project, ".git")), head, dirty: status === undefined ? undefined : Boolean(status.trim()) },
    lockfile,
    toolchain: { bun: Bun.version, node: process.version },
    commands: { build: "bun run build", install: `bun scripts/install-plugin.mjs ${command}` },
    artifacts,
    validation,
  }
}

function git(...args) {
  const result = Bun.spawnSync(["git", "-C", project, ...args], { stdout: "pipe", stderr: "pipe" })
  if (result.exitCode !== 0) return undefined
  return new TextDecoder().decode(result.stdout).trim()
}
