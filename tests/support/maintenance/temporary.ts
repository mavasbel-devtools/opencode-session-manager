import { mkdtempSync, rmSync } from "node:fs"
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
  const temporary = resolve(tmpdir())
  if (resolved === temporary || !resolved.toLowerCase().startsWith(`${temporary.toLowerCase()}${sep}`)) {
    throw new Error(`refusing to delete ${resolved}: tests may only delete inside ${temporary}`)
  }
  rmSync(resolved, { recursive: true, force: true })
}
