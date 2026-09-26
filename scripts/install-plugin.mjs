import { createHash } from "node:crypto"
import { copyFile, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const pluginName = "sessions-transfer"
const pluginId = "opencode-sessions-transfer"
const sourceRepository = await isSourceWorktree()
const sourceHead = sourceRepository ? await git("rev-parse", "HEAD") : undefined
const sourceStatus = sourceRepository ? await git("status", "--porcelain") : undefined
const sourceDirty = sourceStatus === undefined ? undefined : Boolean(sourceStatus.trim())
const v1Artifacts = [
  { source: path.join(project, "dist", "sessions-transfer.js"), target: "sessions-transfer.js" },
  { source: path.join(project, "dist", "sessions-transfer.tui.js"), target: "sessions-transfer.tui.js" },
]
const v2Artifacts = [
  { source: path.join(project, "dist", "v2", "server.js"), target: "server.js" },
  { source: path.join(project, "dist", "v2", "tui.js"), target: "tui.js" },
]

const command = process.argv[2]
if (!new Set(["v1", "v2", "validate-v1", "validate-v2"]).has(command)) {
  throw new Error("usage: bun scripts/install-plugin.mjs <v1|v2|validate-v1|validate-v2>")
}

if (command === "v1") await installV1()
if (command === "v2") await installV2()
if (command === "validate-v1") await validateV1()
if (command === "validate-v2") await validateV2()

function sha256(value) {
  return createHash("sha256").update(value).digest("hex")
}

async function fileRecord(source, target) {
  const bytes = await readFile(source)
  return { file: target, bytes: bytes.byteLength, sha256: sha256(bytes) }
}

async function required(records) {
  for (const entry of records) await stat(entry.source)
}

function homeDirectory() {
  return process.env.USERPROFILE ?? process.env.HOME ?? os.homedir()
}

function v1PluginDirectory() {
  const value =
    process.env.OPENCODE_V1_PLUGIN_DIR ??
    process.env.OPENCODE_V1_RELEASE_DIRECTORY ??
    process.env.OPENCODE_PLUGIN_DIR
  if (!value) {
    throw new Error(
      "OPENCODE_V1_PLUGIN_DIR (or OPENCODE_V1_RELEASE_DIRECTORY) is required; installers never choose or edit a global OpenCode profile",
    )
  }
  return path.resolve(value)
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

async function installV1() {
  await required(v1Artifacts)
  const destination = v1PluginDirectory()
  await mkdir(destination, { recursive: true })
  const artifacts = []
  for (const entry of v1Artifacts) {
    const target = path.join(destination, entry.target)
    await atomicCopy(entry.source, target)
    artifacts.push(await fileRecord(target, entry.target))
  }
  const manifestDirectory = path.join(destination, ".opencode-plugin-manifests")
  await mkdir(manifestDirectory, { recursive: true })
  const server = await import(`${pathToFileURL(path.join(destination, "sessions-transfer.js")).href}?validate=${Date.now()}`)
  const tui = await import(`${pathToFileURL(path.join(destination, "sessions-transfer.tui.js")).href}?validate=${Date.now()}`)
  if (typeof server.default !== "function" || tui.default?.id !== `${pluginId}-tui` || typeof tui.default?.tui !== "function") {
    throw new Error("v1 artifacts do not expose the expected server and TUI module shapes")
  }
  await atomicText(path.join(manifestDirectory, `${pluginName}-v1.json`), `${JSON.stringify(await manifest("v1.18.32", artifacts, {
    moduleShape: "passed",
    isolatedHost: "not-run",
  }), null, 2)}\n`)
  console.log(JSON.stringify({ host: "v1", destination, artifacts }, null, 2))
}

async function installV2() {
  await required(v2Artifacts)
  const root = path.join(v2PluginRoot(), pluginName)
  const records = await Promise.all(v2Artifacts.map((entry) => fileRecord(entry.source, entry.target)))
  const releaseHash = sha256(JSON.stringify(records))
  const release = path.join(root, "releases", `sha256-${releaseHash}`)
  await mkdir(release, { recursive: true })
  for (const entry of v2Artifacts) await atomicCopy(entry.source, path.join(release, entry.target))
  const server = await import(`${pathToFileURL(path.join(release, "server.js")).href}?validate=${Date.now()}`)
  const tui = await import(`${pathToFileURL(path.join(release, "tui.js")).href}?validate=${Date.now()}`)
  if (server.default?.id !== pluginId || typeof server.default?.setup !== "function" || tui.default?.id !== pluginId || typeof tui.default?.setup !== "function") {
    throw new Error("v2 artifacts do not expose the expected server and TUI module shapes")
  }
  const releaseManifest = {
    ...(await manifest("v2.0.14", records, { moduleShape: "passed", isolatedHost: "not-run" })),
    releaseHash,
  }
  await atomicText(path.join(release, "manifest.json"), `${JSON.stringify(releaseManifest, null, 2)}\n`)
  console.log(JSON.stringify({ host: "v2", root, release, manifest: releaseManifest }, null, 2))
}

async function validateV1() {
  const destination = v1PluginDirectory()
  const manifestPath = path.join(destination, ".opencode-plugin-manifests", `${pluginName}-v1.json`)
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"))
  await validateFiles(destination, manifest.artifacts)
  console.log(JSON.stringify({ host: "v1", destination, status: "valid" }))
}

async function validateV2() {
  const release = v2ReleaseDirectory()
  const manifest = JSON.parse(await readFile(path.join(release, "manifest.json"), "utf8"))
  await validateFiles(release, manifest.artifacts)
  const module = await import(`${pathToFileURL(path.join(release, "server.js")).href}?validate=${Date.now()}`)
  if (module.default?.id !== pluginId || typeof module.default?.setup !== "function") {
    throw new Error("v2 server artifact does not expose the expected default setup module")
  }
  const tui = await import(`${pathToFileURL(path.join(release, "tui.js")).href}?validate=${Date.now()}`)
  if (tui.default?.id !== pluginId || typeof tui.default?.setup !== "function") {
    throw new Error("v2 TUI artifact does not expose the expected default setup module")
  }
  const expectedRoot = `${path.join(v2PluginRoot(), pluginName, "releases")}${path.sep}`
  if (!release.startsWith(expectedRoot)) throw new Error("v2 release is outside its configured immutable release root")
  console.log(JSON.stringify({ host: "v2", release, status: "valid" }))
}

async function validateFiles(root, artifacts) {
  for (const artifact of artifacts) {
    const actual = await fileRecord(path.join(root, artifact.file), artifact.file)
    if (actual.bytes !== artifact.bytes || actual.sha256 !== artifact.sha256) {
      throw new Error(`artifact mismatch: ${artifact.file}`)
    }
  }
}

async function manifest(host, artifacts, validation) {
  const lockfile = await fileRecord(path.join(project, "bun.lock"), "bun.lock")
  return {
    schema: 1,
    host,
    contracts: { v1: "1.18.32", v2: "2.0.14" },
    pluginName,
    pluginId,
    source: { repository: sourceRepository, head: sourceHead, dirty: sourceDirty },
    lockfile,
    toolchain: { bun: Bun.version, node: process.version },
    commands: { build: "bun run build", install: `bun scripts/install-plugin.mjs ${command}` },
    artifacts,
    validation,
  }
}

async function git(...args) {
  const result = Bun.spawnSync(["git", "-C", project, ...args], { stdout: "pipe", stderr: "pipe" })
  if (result.exitCode !== 0) return undefined
  return new TextDecoder().decode(result.stdout).trim()
}

async function isSourceWorktree() {
  try {
    await stat(path.join(project, ".git"))
    return true
  } catch {
    return false
  }
}
