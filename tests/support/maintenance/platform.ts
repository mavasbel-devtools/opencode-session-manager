import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { basename, delimiter, join } from "node:path"
import { currentPlatform } from "@test/support/platform"

/** What the tests need to know about the machine they run on. */
export const onWindows = currentPlatform() === "win32"

/**
 * The process name this test process is listed under: `node.exe` by `tasklist`, `/proc/self/comm`
 * on Linux, the running binary's own name elsewhere (macOS has no `/proc`).
 */
export function ownImage(): string {
  if (onWindows) return "node.exe"
  if (currentPlatform() === "linux") return readFileSync("/proc/self/comm", "utf8").trim()
  return basename(process.execPath)
}

/**
 * How the refusal for a database this test process holds open reads: Windows can only report the
 * refused rename (EBUSY); Linux names the holder, which is this process.
 */
export function heldByThisProcess(): RegExp {
  const holder = onWindows ? "EBUSY" : `${ownImage()} ${process.pid}`
  return new RegExp(`held open by another process \\(${holder.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\)`)
}

/**
 * The environment for running the frozen pre-restructure tool, which calls `tasklist` and therefore
 * only runs on Windows as written. Off Windows, a stand-in `tasklist` is put first on `PATH` that
 * prints exactly what the real one prints when nothing matches the filter. The tests run it only for
 * an image that matches nothing, so the stand-in answers what the real command would.
 */
export function legacyEnvironment(workspace: string, base: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  if (onWindows) return base
  const bin = join(workspace, "legacy-bin")
  mkdirSync(bin, { recursive: true })
  const stub = join(bin, "tasklist")
  writeFileSync(stub, "#!/bin/sh\necho 'INFO: No tasks are running which match the specified criteria.'\n")
  chmodSync(stub, 0o755)
  return { ...base, PATH: `${bin}${delimiter}${base["PATH"] ?? ""}` }
}
