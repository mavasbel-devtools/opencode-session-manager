// Drives `/transfer-session` in the real OpenCode TUI inside a pseudo-terminal and reads the
// screen back through a headless xterm, like drive-tui.mjs. In the folder browser it types the
// tree's path, completes a name, goes into the folder with →, back up with ←, types a folder that
// does not exist, presses Enter twice (the second creates it), and waits for the success toast.
// Prints one JSON line: the steps that were seen, and the dialog's lines at each checkpoint.
// Runs under Node (node-pty's native addon), and only ever kills the PTY child it spawned.
//   node drive-transfer.mjs <opencode> <server url> <session id> <env.json> <cwd> <tree> <new folder name>
import { readFileSync } from "node:fs"
import pty from "@lydell/node-pty"
import xterm from "@xterm/headless"

const [executable, server, sessionID, envFile, cwd, tree, created] = process.argv.slice(2)
const env = JSON.parse(readFileSync(envFile, "utf8"))
const COLS = 160
const ROWS = 50
const KEYS = { up: "\x1b[A", down: "\x1b[B", right: "\x1b[C", left: "\x1b[D", enter: "\r", backspace: "\x7f" }
const term = new xterm.Terminal({ cols: COLS, rows: ROWS, allowProposedApi: true })
const child = pty.spawn(executable, ["-s", sessionID, "--server", server], { name: "xterm-256color", cols: COLS, rows: ROWS, cwd, env })
child.onData((data) => term.write(data))

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function screen() {
  const buffer = term.buffer.active
  const lines = []
  for (let row = 0; row < ROWS; row++) lines.push(buffer.getLine(buffer.viewportY + row)?.translateToString(true) ?? "")
  return lines
}

/** The dialog's lines: from its title to its footer, trimmed. */
function dialog() {
  const lines = screen().map((line) => line.trim())
  const first = lines.findIndex((line) => line.startsWith("Transfer session ("))
  if (first === -1) return []
  const last = lines.findIndex((line, index) => index > first && (line.startsWith("↑↓ select") || line.startsWith("Enter again")))
  return lines.slice(first, last === -1 ? first + 20 : last + 1).filter((line) => line.length > 0)
}

async function waitFor(test, timeout = 30_000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (test()) return true
    await sleep(200)
  }
  return false
}
const seen = (text) => () => screen().some((line) => line.includes(text))
const inDialog = (text) => () => dialog().some((line) => line.includes(text))

async function type(text) {
  for (const character of text) {
    child.write(character)
    await sleep(25)
  }
}
async function press(key) {
  child.write(KEYS[key])
  await sleep(400)
}

const steps = {}
const checkpoints = {}
steps.sidebar = await waitFor(seen(sessionID), 60_000)
await type("/transfer-session")
await sleep(500)
child.write("\r")
steps.browser = await waitFor(seen("Transfer session ("))
await sleep(500)
checkpoints.opened = dialog()

await type(`${tree}/`)
steps.listed = await waitFor(inDialog("· this folder"))
await sleep(300)
checkpoints.tree = dialog()

await type("al")
await sleep(500)
checkpoints.completing = dialog()
await press("right")
steps.entered = await waitFor(inDialog("alpha  · this folder"))
checkpoints.entered = dialog()
await press("left")
await press("left")
checkpoints.up = dialog()

// Clear the box (it holds the tree's parent folder), then type a folder that does not exist.
for (let index = 0; index < tree.length + 4; index++) {
  child.write(KEYS.backspace)
  await sleep(10)
}
await type(`${tree}/alpha/${created}`)
await sleep(500)
checkpoints.typedNew = dialog()
await press("enter")
steps.confirm = await waitFor(inDialog("Enter again to create"))
checkpoints.confirm = dialog()
await press("enter")
steps.toast = await waitFor(seen("Session transferred"))
const final = screen()
const pid = child.pid
child.kill()
console.log(JSON.stringify({ pid, steps, checkpoints, screen: Object.values(steps).every(Boolean) ? undefined : final }))
process.exit(0)
