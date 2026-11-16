// Opens the real OpenCode TUI on its home screen inside a pseudo-terminal and waits for the
// plugin's startup location repair to report through a toast; reads the screen back through a
// headless xterm. Prints one JSON line. Runs under Node (node-pty's native addon), and only ever
// kills the PTY child it spawned.
//   node drive-repair.mjs <opencode> <server url> <env.json> <cwd> <expected text>
import { readFileSync } from "node:fs"
import pty from "@lydell/node-pty"
import xterm from "@xterm/headless"

const [executable, server, envFile, cwd, expected] = process.argv.slice(2)
const env = JSON.parse(readFileSync(envFile, "utf8"))
const COLS = 200
const ROWS = 50
const term = new xterm.Terminal({ cols: COLS, rows: ROWS, allowProposedApi: true })
const child = pty.spawn(executable, ["--server", server], { name: "xterm-256color", cols: COLS, rows: ROWS, cwd, env: { ...env, PWD: cwd } })
child.onData((data) => term.write(data))

function screen() {
  const buffer = term.buffer.active
  const lines = []
  for (let row = 0; row < ROWS; row++) lines.push(buffer.getLine(buffer.viewportY + row)?.translateToString(true) ?? "")
  return lines
}

const deadline = Date.now() + 90_000
let found = false
while (Date.now() < deadline) {
  await new Promise((resolve) => setTimeout(resolve, 250))
  if (screen().join("\n").replace(/\s+/g, " ").includes(expected)) {
    found = true
    break
  }
}
const lines = screen()
const pid = child.pid
child.kill()
console.log(JSON.stringify({ pid, found, ...(found ? {} : { screen: lines }) }))
process.exit(0)
