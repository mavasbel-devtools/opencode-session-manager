import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import type { CliEnvironment } from "@session-manager/infrastructure/adapters/inbound/cli/CompactCliAdapter"
import { buildContainer } from "@session-manager/main/cli-container"
import { LocalRegistry } from "@test/support/patches/registry"
import { FakeOutput } from "@test/support/maintenance/fakes/output"
import { onlyOn } from "@test/support/platform"
import { Sandbox } from "@test/support/patches/sandbox"

let box: Sandbox
beforeEach(() => {
  box = new Sandbox()
})
afterEach(() => box.dispose())

async function run(extra: Record<string, string>, ...argv: string[]) {
  const output = new FakeOutput()
  const code = await (await buildContainer({ ...box.env(), ...extra } as CliEnvironment, { output })).run(["patches", ...argv])
  return { code, out: output.text() }
}

describe("patches through the real win32 platform adapters", () => {
  it.skipIf(onlyOn("win32"))("effect sees a rejection logged after the server started (win32 only)", async () => {
    box.threshold(13)
    box.log([
      "[2099-01-01T00:00:00.000Z] [config] config reload failed ~/.config/cortexkit/magic-context.jsonc: invalid configuration: [user config] \"execute_threshold_percentage\": invalid value (number 13), using default 65.",
      "[2099-01-01T00:00:00.000Z] [config] compartment trigger: not firing at 13% \u2014 below proactive floor (11%).",
    ])
    const result = await run({}, "effect")
    expect([result.code, result.out.split("\n").at(-1)]).toEqual([1, "verdict: rejected"])
  })

  it.skipIf(onlyOn("win32"))("notify warns through the wired notifier (win32 only)", async () => {
    box.install("0.49.50")
    box.pin("0.49.50")
    const notifier = box.notifier()
    const result = await run({ OPENCODE_SESSION_MANAGER_PATCHES_NOTIFY_BIN: notifier.command }, "notify")
    expect(result.code).toBe(1)
    expect(result.out).toContain("notified: execute-threshold-min on 0.49.50: not-applied")
    expect(readFileSync(notifier.calls, "utf8").trim().split("\n")).toHaveLength(1)
  })

  it.skipIf(onlyOn("win32"))("a lock held by a live owner keeps follow out (win32 only)", async () => {
    box.pin("0.49.50")
    const registry = new LocalRegistry([])
    const lock = path.join(box.state, "opencode-session-manager", "patches", "follow.lock")
    mkdirSync(path.dirname(lock), { recursive: true })
    try {
      writeFileSync(lock, String(process.pid))
      expect(JSON.parse((await run({}, "follow", "--json")).out).outcome).toBe("busy")
      expect(JSON.parse((await run({}, "follow", "--rollback", "--json")).out).outcome).toBe("busy")
      writeFileSync(lock, String(2 ** 30))
      expect(JSON.parse((await run({ OPENCODE_SESSION_MANAGER_PATCHES_REGISTRY: registry.url }, "follow", "--json")).out).outcome).toBe("stopped")
    } finally {
      registry.stop()
    }
  })
})
