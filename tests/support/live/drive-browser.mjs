// Drives the session browser (`opencode-session-manager tui …`) inside a pseudo-terminal and reads the
// screen back through a headless xterm. Runs under Node (node-pty's native addon). Prints one JSON line:
// the screen after each step, and the exit code. Only ever kills the PTY child it spawned.
//   node drive-browser.mjs <steps.json> <executable> [args...]
// steps.json: [{ "keys": "jj", "waitFor": "text that must appear", "timeoutMs": 20000 }, ...]
import { readFileSync } from "node:fs"
import pty from "@lydell/node-pty"
import xterm from "@xterm/headless"

const [stepsFile, executable, ...args] = process.argv.slice(2)
const steps = JSON.parse(readFileSync(stepsFile, "utf8"))
const COLS = 140
const ROWS = 32
const term = new xterm.Terminal({ cols: COLS, rows: ROWS, allowProposedApi: true })
const child = pty.spawn(executable, args, { name: "xterm-256color", cols: COLS, rows: ROWS, cwd: process.cwd(), env: process.env })
let exitCode = null
child.onData((data) => term.write(data))
child.onExit(({ exitCode: code }) => {
  exitCode = code
})

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
function screen() {
  const buffer = term.buffer.active
  const lines = []
  for (let row = 0; row < ROWS; row++) lines.push(buffer.getLine(buffer.viewportY + row)?.translateToString(true) ?? "")
  return lines
}

const screens = []
let ok = true
for (const step of steps) {
  if (step.keys) child.write(step.keys)
  const deadline = Date.now() + (step.timeoutMs ?? 20_000)
  let found = step.waitFor === undefined
  while (Date.now() < deadline && !found) {
    await sleep(100)
    found = screen().some((line) => line.includes(step.waitFor))
  }
  await sleep(step.settleMs ?? 300)
  screens.push(screen())
  if (!found) {
    ok = false
    break
  }
}
const deadline = Date.now() + 10_000
while (exitCode === null && Date.now() < deadline) await sleep(100)
if (exitCode === null) child.kill()
console.log(JSON.stringify({ ok, exitCode, screens }))
process.exit(0)
