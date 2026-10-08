// Drives the real OpenCode TUI inside a pseudo-terminal (ConPTY on Windows) and reads the screen back
// through a headless xterm. Runs under Node (node-pty's native addon), prints one
// JSON line, and only ever kills the PTY child it spawned.
//   node drive-tui.mjs <opencode> <server url> <session id> <env.json> <cwd>
import { readFileSync } from "node:fs"
import pty from "@lydell/node-pty"
import xterm from "@xterm/headless"

const [executable, server, sessionID, envFile, cwd] = process.argv.slice(2)
const env = JSON.parse(readFileSync(envFile, "utf8"))
const COLS = 200
const ROWS = 50
const SIDEBAR_WIDTH = 42 // SESSION_SIDEBAR_WIDTH, packages/tui/src/ui/layout.ts
const term = new xterm.Terminal({ cols: COLS, rows: ROWS, allowProposedApi: true })
const child = pty.spawn(executable, ["-s", sessionID, "--server", server], { name: "xterm-256color", cols: COLS, rows: ROWS, cwd, env })
child.onData((data) => term.write(data))

function screen() {
  const buffer = term.buffer.active
  const lines = []
  for (let row = 0; row < ROWS; row++) lines.push(buffer.getLine(buffer.viewportY + row)?.translateToString(false) ?? "")
  return lines
}

const deadline = Date.now() + 60_000
let result = { found: false }
while (Date.now() < deadline) {
  await new Promise((resolve) => setTimeout(resolve, 250))
  const lines = screen()
  const sidebar = (line) => line.slice(COLS - SIDEBAR_WIDTH)
  const row = lines.findIndex((line) => sidebar(line).includes(sessionID))
  if (row === -1) continue
  const col = lines[row].lastIndexOf(sessionID)
  result = {
    found: true,
    row,
    col,
    inSidebar: col >= COLS - SIDEBAR_WIDTH,
    above1: sidebar(lines[row - 1] ?? "").trim(),
    above2: sidebar(lines[row - 2] ?? "").trim(),
    line: sidebar(lines[row]).trim(),
    // The transcript may also show the ID (the mock echoes the tool result); only the sidebar column counts.
    sidebarOccurrences: lines.filter((line) => sidebar(line).includes(sessionID)).length,
  }
  break
}
if (!result.found) result.screen = screen()
const pid = child.pid
child.kill()
console.log(JSON.stringify({ pid, ...result }))
process.exit(0)
