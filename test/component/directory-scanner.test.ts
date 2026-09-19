import { describe, it, expect } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { DirectoryScannerAdapter } from "@transfer/infrastructure/adapters/outbound/fs/DirectoryScannerAdapter"

function tmp(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix))
}

describe("DirectoryScannerAdapter", () => {
  const scanner = new DirectoryScannerAdapter()
  const home = os.homedir()

  it("creates nested directories recursively", () => {
    const root = tmp("scanner-ensure-")
    const nested = path.join(root, "a", "b", "c")
    try {
      scanner.ensureDirectory(nested)
      expect(fs.statSync(nested).isDirectory()).toBe(true)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it("canonical resolves an existing directory to its on-disk casing", () => {
    const root = tmp("scanner-canon-")
    try {
      const canonical = scanner.canonical(root.toLowerCase(), home)
      expect(canonical.toLowerCase()).toBe(fs.realpathSync.native(root).toLowerCase())
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it("canonical falls back to a resolved path for a missing directory", () => {
    const missing = path.join(os.tmpdir(), `scanner-missing-${Date.now()}`, "deep")
    expect(scanner.canonical(missing, home)).toBe(path.resolve(missing))
  })

  it("expands ~ through canonical", () => {
    const expanded = scanner.canonical("~", home)
    expect(expanded).toBe(fs.realpathSync.native(home))
  })

  it("autocomplete returns only non-hidden subdirectories", () => {
    const root = tmp("scanner-auto-")
    fs.mkdirSync(path.join(root, "beta"))
    fs.mkdirSync(path.join(root, "alpha"))
    fs.mkdirSync(path.join(root, ".hidden"))
    fs.writeFileSync(path.join(root, "file.txt"), "x")
    try {
      const result = scanner.autocomplete(root, home)
      expect(result.length).toBe(2)
      expect(path.basename(result[0]!)).toBe("alpha")
      expect(path.basename(result[1]!)).toBe("beta")
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it("autocomplete filters by the trailing partial name", () => {
    const root = tmp("scanner-partial-")
    fs.mkdirSync(path.join(root, "alpha"))
    fs.mkdirSync(path.join(root, "beta"))
    try {
      const result = scanner.autocomplete(path.join(root, "al"), home)
      expect(result.length).toBe(1)
      expect(path.basename(result[0]!)).toBe("alpha")
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it("autocomplete honors the limit", () => {
    const root = tmp("scanner-limit-")
    for (let i = 0; i < 5; i++) fs.mkdirSync(path.join(root, `dir-${i}`))
    try {
      expect(scanner.autocomplete(root, home, 2).length).toBe(2)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it("autocomplete returns an empty list for blank input", () => {
    expect(scanner.autocomplete("   ", home)).toEqual([])
  })

  it("autocomplete treats an existing file as a partial name in its parent", () => {
    const root = tmp("scanner-file-")
    fs.mkdirSync(path.join(root, "alpha"))
    fs.writeFileSync(path.join(root, "alp"), "x")
    try {
      const result = scanner.autocomplete(path.join(root, "alp"), home)
      expect(result.length).toBe(1)
      expect(path.basename(result[0]!)).toBe("alpha")
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it("autocomplete returns an empty list when the parent is unreadable", () => {
    const missing = path.join(os.tmpdir(), `scanner-none-${Date.now()}`, "child")
    expect(scanner.autocomplete(missing, home)).toEqual([])
  })
})
