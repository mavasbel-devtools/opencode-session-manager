import fs from "node:fs"
import path from "node:path"
import { expandHome } from "@transfer/domain/paths"
import type { FileSystemPort } from "@transfer/domain/ports"

export class DirectoryScannerAdapter implements FileSystemPort {
  constructor() {}

  ensureDirectory(directory: string): void {
    fs.mkdirSync(directory, { recursive: true })
  }

  canonical(directory: string, home: string): string {
    const expanded = expandHome(directory, home)
    try {
      // Bun always provides the native realpath, which recovers on-disk casing.
      const native = fs.realpathSync as unknown as { native: (input: string) => string }
      return native.native(expanded)
    } catch {
      return path.resolve(expanded)
    }
  }

  autocomplete(input: string, home: string, limit = 15): string[] {
    const trimmed = input.trim()
    if (!trimmed) return []

    const expanded = expandHome(trimmed, home)
    let scan = expanded
    let partial = ""

    try {
      if (!fs.statSync(expanded).isDirectory()) {
        scan = path.dirname(expanded)
        partial = path.basename(expanded).toLowerCase()
      }
    } catch {
      scan = path.dirname(expanded)
      partial = path.basename(expanded).toLowerCase()
    }

    const results: string[] = []
    try {
      for (const entry of fs.readdirSync(scan, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue
        if (entry.name.startsWith(".")) continue
        if (partial && !entry.name.toLowerCase().startsWith(partial)) continue
        results.push(this.canonical(path.join(scan, entry.name), home))
      }
    } catch {
      return []
    }

    return results.sort((a, b) => a.localeCompare(b)).slice(0, limit)
  }
}
