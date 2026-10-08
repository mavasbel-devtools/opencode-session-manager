import { describe, it, expect } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { NodeFileSystemAdapter } from "@session-manager/infrastructure/adapters/outbound/fs/NodeFileSystemAdapter"

function tmp(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix))
}

describe("NodeFileSystemAdapter", () => {
  const scanner = new NodeFileSystemAdapter()
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
})
