import { mkdtempSync, realpathSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve, sep } from "node:path"

/** A fresh workspace inside the OS temporary directory. */
export function temporaryWorkspace(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix))
}

/**
 * Removes a test workspace, refusing any path that is not strictly inside the OS temporary
 * directory. An empty or unassigned path resolves to the working directory, and deleting that
 * destroyed a whole repository once; this guard makes that impossible.
 */
export function removeTemporary(target: string | undefined): void {
  if (target === undefined || target.length === 0) return
  const resolved = resolve(target)
  // The tests resolve their workspaces before comparing them with resolved code output (`/var`
  // vs `/private/var` on macOS), so both forms of the temporary folder guard the delete.
  const inside = [resolve(tmpdir()), resolve(realpathSync(tmpdir()))].some(
    (root) => resolved !== root && resolved.toLowerCase().startsWith(`${root.toLowerCase()}${sep}`),
  )
  if (!inside) {
    throw new Error(`refusing to delete ${resolved}: tests may only delete inside ${resolve(tmpdir())}`)
  }
  rmSync(resolved, { recursive: true, force: true })
}
