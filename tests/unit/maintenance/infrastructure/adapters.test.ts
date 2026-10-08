import { test } from "bun:test"
import assert from "node:assert/strict"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { homedir, tmpdir } from "node:os"
import { join } from "node:path"
import { ConsoleOutputAdapter } from "@session-manager/infrastructure/adapters/outbound/system/ConsoleOutputAdapter"
import { JsonReportAdapter } from "@session-manager/infrastructure/adapters/outbound/fs/JsonReportAdapter"
import { NodeMaintenanceFileSystemAdapter } from "@session-manager/infrastructure/adapters/outbound/fs/NodeMaintenanceFileSystemAdapter"
import { SystemClockAdapter } from "@session-manager/infrastructure/adapters/outbound/system/SystemClockAdapter"

function temporaryDirectory(): string {
  return mkdtempSync(join(tmpdir(), "oc-compact-unit-"))
}

test("NodeMaintenanceFileSystemAdapter performs the real file operations", () => {
  const directory = temporaryDirectory()
  try {
    const fileSystem = new NodeMaintenanceFileSystemAdapter()
    const file = join(directory, "a.txt")
    assert.equal(fileSystem.exists(file), false)
    writeFileSync(file, "hello")
    assert.equal(fileSystem.exists(file), true)
    assert.equal(fileSystem.size(file), 5)
    assert.ok(fileSystem.freeBytes(directory) > 0)

    const nested = join(directory, "deep", "deeper")
    fileSystem.mkdirp(nested)
    assert.equal(fileSystem.exists(nested), true)

    const moved = join(directory, "b.txt")
    fileSystem.rename(file, moved)
    assert.equal(fileSystem.exists(file), false)
    assert.equal(fileSystem.size(moved), 5)

    fileSystem.remove(moved)
    assert.equal(fileSystem.exists(moved), false)
    fileSystem.remove(moved)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test("JsonReportAdapter writes indented JSON and creates the directory", () => {
  const directory = temporaryDirectory()
  try {
    const file = join(directory, "nested", "report.json")
    new JsonReportAdapter().write(file, { mode: "rehearse", ok: true })
    assert.equal(readFileSync(file, "utf8"), JSON.stringify({ mode: "rehearse", ok: true }, null, 2))

    const flat = join(directory, "flat.json")
    new JsonReportAdapter().write(flat, { a: 1 })
    assert.equal(readFileSync(flat, "utf8"), '{\n  "a": 1\n}')
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test("ConsoleOutputAdapter writes one line per call", () => {
  const original = console.log
  const lines: string[] = []
  console.log = (value?: unknown) => {
    lines.push(String(value))
  }
  try {
    const output = new ConsoleOutputAdapter()
    output.line("first")
    output.line("second")
  } finally {
    console.log = original
  }
  assert.deepEqual(lines, ["first", "second"])
})

test("SystemClockAdapter exposes the ambient runtime", () => {
  const runtime = new SystemClockAdapter()
  assert.equal(runtime.pid(), process.pid)
  assert.equal(runtime.platform(), process.platform)
  assert.ok(runtime.now() >= 0)
  assert.equal(runtime.temporaryDirectory(), tmpdir())
  const saved = { HOME: process.env["HOME"], USERPROFILE: process.env["USERPROFILE"] }
  try {
    process.env["HOME"] = "/tmp/home-from-env"
    assert.equal(runtime.homeDirectory(), "/tmp/home-from-env", "HOME is read on every call")
    delete process.env["HOME"]
    process.env["USERPROFILE"] = "C:/Users/Someone"
    assert.equal(runtime.homeDirectory(), "C:/Users/Someone")
    delete process.env["USERPROFILE"]
    assert.equal(runtime.homeDirectory(), homedir())
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
  assert.match(runtime.stamp(), /^\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}$/)
  assert.equal(runtime.stamp(new Date(2026, 8, 6, 7, 5, 3)), "2026-09-06-07-05-03")
})
