import { createHash } from "node:crypto"
import { chmod, copyFile, mkdir, readFile, rename, rm, stat } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

/**
 * Installs the compiled CLI as `opencode-session-manager` in `OPENCODE_SESSION_MANAGER_BIN_DIR`
 * (default `~/.local/bin`). It is copied, not linked, so rebuilding the checkout never touches the
 * command in use; the copy lands under a temporary name and is renamed over the old one, so a run
 * in progress keeps its own file. Then the installed file must be byte-identical to the build and
 * answer `--version`.
 *   bun scripts/install-cli.mjs <install|validate>
 */
const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const name = process.platform === "win32" ? "opencode-session-manager.exe" : "opencode-session-manager"
const source = path.join(project, "dist", "cli", name)
const directory = process.env.OPENCODE_SESSION_MANAGER_BIN_DIR || path.join(process.env.HOME || os.homedir(), ".local", "bin")
const target = path.join(directory, name)

const command = process.argv[2]
if (command !== "install" && command !== "validate") throw new Error("usage: bun scripts/install-cli.mjs <install|validate>")

const sha = async (file) => createHash("sha256").update(await readFile(file)).digest("hex")

if (command === "install") {
  await stat(source).catch(() => {
    throw new Error(`no build at ${source}; run \`bun run build\` first`)
  })
  await mkdir(directory, { recursive: true })
  const staging = `${target}.installing-${process.pid}`
  try {
    await copyFile(source, staging)
    await chmod(staging, 0o755)
    await rename(staging, target)
  } finally {
    await rm(staging, { force: true })
  }
}

const result = { target, identical: false, version: null, onPath: false }
result.identical = (await sha(target)) === (await sha(source))
const run = Bun.spawnSync([target, "--version"], { stdout: "pipe", stderr: "pipe" })
result.version = run.exitCode === 0 ? run.stdout.toString().trim() : null
result.onPath = (process.env.PATH || "").split(path.delimiter).some((entry) => path.resolve(entry) === path.resolve(directory))
console.log(JSON.stringify({ status: result.identical && result.version !== null ? "valid" : "invalid", ...result }))
if (!result.onPath) console.error(`warning: ${directory} is not on PATH; add it, or run ${target} by its path`)
if (!result.identical || result.version === null) process.exitCode = 1
