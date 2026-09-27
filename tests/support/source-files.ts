import { globSync } from "node:fs"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"

/**
 * Loads every TypeScript file under src so that none can escape the per-file coverage gate.
 * Node reports a file only once something imports it, so a new source file that no test
 * touches would otherwise be invisible to `scripts/coverage.mjs`.
 */
export async function loadEverySource(): Promise<readonly string[]> {
  const files = globSync("src/**/*.ts").sort()
  for (const file of files) await import(pathToFileURL(resolve(file)).href)
  return files
}
