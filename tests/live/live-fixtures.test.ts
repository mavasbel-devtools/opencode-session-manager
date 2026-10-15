import { afterAll, describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { removeTemporary } from "@test/support/live/process"

const project = path.resolve(import.meta.dir, "../..")
const root = mkdtempSync(path.join(os.tmpdir(), "session-manager-live-fixtures-"))

afterAll(async () => {
  if (path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep)) await removeTemporary(root)
})

async function run(arguments_: string[], destination: string) {
  const env = { ...(process.env as Record<string, string>), OPENCODE_SM_LIVE_FIXTURES: destination }
  const child = Bun.spawn([process.execPath, "scripts/live-fixtures.mjs", ...arguments_], { cwd: project, env, stdout: "pipe", stderr: "pipe" })
  const [exitCode, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()])
  return { exitCode, stdout, stderr }
}

function store(file: string, content: string): void {
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, content)
}

describe("bun run fixtures:live", () => {
  test("copies another profile (side by side or as a data home) and an older context store into the fixtures folder", async () => {
    const backup = path.join(root, "backup")
    store(path.join(backup, "opencode.db"), "opencode")
    store(path.join(backup, "context.db"), "context")
    store(path.join(root, "old", "context.db"), "old")
    const destination = path.join(root, "fixtures")
    const placed = await run(["--other", backup, "--old-context", path.join(root, "old", "context.db")], destination)
    expect(placed.exitCode).toBe(0)
    expect(JSON.parse(placed.stdout).destination).toBe(destination)
    expect(readFileSync(path.join(destination, "other-profile", "opencode", "opencode.db"), "utf8")).toBe("opencode")
    expect(readFileSync(path.join(destination, "other-profile", "cortexkit", "magic-context", "context.db"), "utf8")).toBe("context")
    expect(readFileSync(path.join(destination, "old-context", "context.db"), "utf8")).toBe("old")

    const dataHome = path.join(root, "data")
    store(path.join(dataHome, "opencode", "opencode.db"), "opencode 2")
    store(path.join(dataHome, "cortexkit", "magic-context", "context.db"), "context 2")
    expect((await run(["--other", dataHome], destination)).exitCode).toBe(0)
    expect(readFileSync(path.join(destination, "other-profile", "opencode", "opencode.db"), "utf8")).toBe("opencode 2")
    expect(readFileSync(path.join(destination, "other-profile", "cortexkit", "magic-context", "context.db"), "utf8")).toBe("context 2")
  })

  test("refuses a store with a non-empty WAL beside it, a missing store, and bad arguments", async () => {
    const destination = path.join(root, "refused")
    const busy = path.join(root, "busy")
    store(path.join(busy, "opencode.db"), "opencode")
    store(path.join(busy, "opencode.db-wal"), "pages")
    store(path.join(busy, "context.db"), "context")
    const wal = await run(["--other", busy], destination)
    expect(wal.exitCode).not.toBe(0)
    expect(wal.stderr).toContain("has a non-empty opencode.db-wal beside it")
    const missing = await run(["--old-context", path.join(root, "nowhere.db")], destination)
    expect(missing.exitCode).not.toBe(0)
    expect(missing.stderr).toContain("does not exist")
    for (const bad of [[], ["--other"], ["--unknown", "x"]]) {
      const refused = await run(bad, destination)
      expect(refused.exitCode).not.toBe(0)
      expect(refused.stderr).toContain("usage: bun scripts/live-fixtures.mjs")
    }
  })
})
