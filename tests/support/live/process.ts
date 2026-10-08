import { rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

export const root = path.resolve(import.meta.dir, "../../..")

export function requireBun() {
  const executable = Bun.which("bun")
  if (!executable) throw new Error("bun executable not found")
  return executable
}

export function requireOpenCode() {
  const executable = process.env.OPENCODE_V2_EXECUTABLE ?? path.join(os.homedir(), ".local", "bin", "opencode.exe")
  if (!Bun.file(executable).size) throw new Error(`OpenCode v2 executable not found: ${executable}`)
  return executable
}

/** Runs a child to completion with stdin closed (an open pipe makes `opencode run` wait for EOF). */
export async function run(command: string[], options: { cwd?: string; env?: Record<string, string>; timeoutMs?: number } = {}) {
  const child = Bun.spawn(command, {
    cwd: options.cwd ?? root,
    env: options.env ?? (process.env as Record<string, string>),
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  })
  const timer = setTimeout(() => child.kill(), options.timeoutMs ?? 120_000)
  const [exitCode, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()])
  clearTimeout(timer)
  return { exitCode, stdout, stderr, pid: child.pid }
}

/**
 * Recursive delete that can only ever hit a temporary directory.
 *
 * Learned the hard way: `fs.rm("", { recursive: true, force: true })` resolves
 * the empty string to the process working directory and deletes the repository.
 * A `beforeAll` that throws before assigning its temp path is enough to trigger
 * it, so every teardown here goes through this guard instead of `rm` directly.
 */
export async function removeTemporary(target: string | undefined) {
  if (!target) return { removed: false, reason: "no path" }
  const resolved = path.resolve(target)
  const temporary = path.resolve(os.tmpdir())
  if (resolved === temporary || !resolved.toLowerCase().startsWith(`${temporary.toLowerCase()}${path.sep}`)) {
    throw new Error(`refusing to delete ${resolved}: only paths inside ${temporary} may be removed by tests`)
  }
  if (resolved.split(path.sep).length < temporary.split(path.sep).length + 1) {
    throw new Error(`refusing to delete ${resolved}: too close to the temporary root`)
  }
  await rm(resolved, { recursive: true, force: true })
  return { removed: true, path: resolved }
}

export function reservePort() {
  const reservation = Bun.serve({ port: 0, fetch: () => new Response("reserved") })
  const port = reservation.port
  reservation.stop(true)
  return port
}

export function stripAnsi(value: string) {
  return value.replace(/\x1B(?:[@-_][0-?]*[ -/]*[@-~]|\][^\x07]*(?:\x07|\x1B\\))/g, "")
}
