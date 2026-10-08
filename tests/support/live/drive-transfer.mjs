// Drives `/transfer-session` in the real OpenCode TUI inside a pseudo-terminal
// and reads the screen back through a headless xterm, like drive-tui.mjs. Picks
// "Enter custom path…", types the destination, and waits for the success toast.
// Runs under Node (node-pty's native addon), prints one JSON line, and only ever
// kills the PTY child it spawned.
//   node drive-transfer.mjs <opencode> <server url> <session id> <env.json> <cwd> <destination>
import { readFileSync } from "node:fs"
import pty from "@lydell/node-pty"
import xterm from "@xterm/headless"

const [executable, server, sessionID, envFile, cwd, destination] = process.argv.slice(2)
const env = JSON.parse(readFileSync(envFile, "utf8"))
const COLS = 200
const ROWS = 50
const term = new xterm.Terminal({ cols: COLS, rows: ROWS, allowProposedApi: true })
const child = pty.spawn(executable, ["-s", sessionID, "--server", server], { name: "xterm-256color", cols: COLS, rows: ROWS, cwd, env })
child.onData((data) => term.write(data))

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function screen() {
  const buffer = term.buffer.active
  const lines = []
  for (let row = 0; row < ROWS; row++) lines.push(buffer.getLine(buffer.viewportY + row)?.translateToString(false) ?? "")
  return lines
}

async function waitFor(text, timeout = 30_000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (screen().some((line) => line.includes(text))) return true
    await sleep(200)
  }
  return false
}

async function type(text) {
  for (const character of text) {
    child.write(character)
    await sleep(15)
  }
}

const steps = {}
steps.sidebar = await waitFor(sessionID, 60_000)
await type("/transfer-session")
await sleep(500)
child.write("\r")
steps.picker = await waitFor("Enter custom path")
await type("Enter custom path")
await sleep(500)
child.write("\r")
steps.prompt = await waitFor("Enter destination directory")
await type(destination)
await sleep(300)
child.write("\r")
steps.toast = await waitFor("Session transferred")
const final = screen()
const pid = child.pid
child.kill()
console.log(JSON.stringify({ pid, steps, screen: Object.values(steps).every(Boolean) ? undefined : final }))
process.exit(0)
