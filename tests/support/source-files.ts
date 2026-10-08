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

/** Operating systems with their own adapters and wiring (see AGENTS.md, platform law). */
export const PLATFORMS: readonly string[] = ["linux", "win32"]

/** The operating system a src file (relative to src/) belongs to: its adapters folder or its container. */
export function platformOf(rel: string): string | undefined {
  const folder = rel.match(/^infrastructure\/adapters\/outbound\/platform\/([^/]+)\//)
  if (folder) return folder[1]
  const container = rel.match(/^main\/(\w+)-container\.ts$/)
  return container && PLATFORMS.includes(container[1]!) ? container[1] : undefined
}

/**
 * Bun instruments only the files a run loads, so a src file that no test imports
 * would silently escape the per-file coverage gate. Every measured tier loads
 * all of them, which makes an untested file show up below 100 % instead.
 *
 * `platform` keeps only that operating system's platform files: the e2e tier runs
 * the real platform adapters, which work only on their own platform, so each
 * platform's e2e run gates its own files. The unit tier runs every platform's
 * adapters with stand-ins and loads them all.
 */
export async function loadEverySource(platform?: string): Promise<string[]> {
  const files = sourceFiles().filter((file) => {
    const own = platformOf(relative(file))
    return platform === undefined || own === undefined || own === platform
  })
  for (const file of files) await import(pathToFileURL(file).href)
  return files.map(relative)
}
