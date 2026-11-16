// Component tier: two real processes — two OpenCode windows — repair the same profile at once.
// Only one may move sessions; the other must see the store's lock and change nothing.
import { afterEach, describe, expect, it } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

const SCRIPT = path.resolve(import.meta.dir, "..", "support", "repair", "repair-process.ts")
const REPOSITORY = path.resolve(import.meta.dir, "..", "..")

let root = ""
afterEach(() => fs.rmSync(root, { recursive: true, force: true }))

function window(store: string, delay: number) {
  return Bun.spawn(["bun", SCRIPT, root, path.join(root, "config"), store, String(delay)], { cwd: REPOSITORY, stdout: "pipe", stderr: "pipe" })
}

async function report(process: ReturnType<typeof window>) {
  const [stdout, stderr, code] = await Promise.all([new Response(process.stdout).text(), new Response(process.stderr).text(), process.exited])
  expect({ code, stderr }).toEqual({ code: 0, stderr: "" })
  return JSON.parse(stdout) as { repaired: unknown[]; busy: boolean }
}

describe("location repair across processes", () => {
  it("lets one window repair while a concurrent one reports busy, then a later one finds nothing left to do", async () => {
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "session-manager-repair-processes-")))
    fs.mkdirSync(path.join(root, "config", "opencode"), { recursive: true })
    fs.mkdirSync(path.join(root, "data"), { recursive: true })
    fs.mkdirSync(path.join(root, "new", "a"), { recursive: true })
    fs.writeFileSync(
      path.join(root, "config", "opencode", "session-manager.jsonc"),
      JSON.stringify({ location_repair: { maps: [{ from: path.join(root, "old"), to: path.join(root, "new") }] } }),
    )
    fs.writeFileSync(
      path.join(root, "sessions.json"),
      JSON.stringify([{ id: "ses_a", title: "A", directory: path.join(root, "old", "a"), projectId: "p", path: "", timeUpdated: 1 }]),
    )
    const store = path.join(root, "data", "opencode.db")

    const first = window(store, 1500)
    // The second window starts once the first is inside its move, holding the lock.
    while (!fs.readdirSync(root).some((entry) => entry.startsWith("moving-"))) await Bun.sleep(10)
    const second = window(store, 0)
    const [a, b] = [await report(first), await report(second)]

    expect([a.repaired.length, a.busy, b.repaired.length, b.busy]).toEqual([1, false, 0, true])
    expect(fs.readFileSync(path.join(root, "moves.log"), "utf8").trim().split("\n")).toHaveLength(1)
    expect(fs.existsSync(`${store}.session-manager.lock`)).toBe(false)

    const third = await report(window(store, 0))
    expect([third.repaired.length, third.busy]).toEqual([0, false])
    expect(fs.readFileSync(path.join(root, "moves.log"), "utf8").trim().split("\n")).toHaveLength(1)
  }, 30_000)
})
