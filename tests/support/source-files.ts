import fs from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"

export const SRC = path.resolve(import.meta.dir, "../../src")

export function sourceFiles(dir: string = SRC): string[] {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) return sourceFiles(full)
      return /\.tsx?$/.test(entry.name) ? [full] : []
    })
    .sort()
}

export const relative = (file: string) => path.relative(SRC, file).replaceAll(path.sep, "/")

/**
 * Bun instruments only the files a run loads, so a src file that no test imports
 * would silently escape the per-file coverage gate. Every measured tier loads
 * all of them, which makes an untested file show up below 100 % instead.
 */
export async function loadEverySource(): Promise<string[]> {
  const files = sourceFiles()
  for (const file of files) await import(pathToFileURL(file).href)
  return files.map(relative)
}
