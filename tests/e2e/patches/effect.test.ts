import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import path from "node:path"
import type { CliEnvironment } from "@session-manager/infrastructure/adapters/inbound/cli/CompactCliAdapter"
import { buildContainer } from "@session-manager/main/cli-container"
import { FakeOutput } from "@test/support/maintenance/fakes/output"
import { onlyOn } from "@test/support/platform"
import { Sandbox, write } from "@test/support/patches/sandbox"

// Real line formats from Magic Context 0.47.0's log.
const BOOT = 1_791_700_000
const at = (secondsAfterBoot: number) => new Date((BOOT + secondsAfterBoot) * 1000).toISOString()
const rejected = (s: number) =>
  `[${at(s)}] [config] config reload failed ~/.config/cortexkit/magic-context.jsonc: invalid configuration: [user config] "execute_threshold_percentage": invalid value (number 13), using default 65.`
const floor = (s: number, value: number) => `[${at(s)}] [magic-context][ses_x] compartment trigger: not firing at 9.0% — below proactive floor (${value}%)`

let box: Sandbox
beforeEach(() => {
  box = new Sandbox()
})
afterEach(() => box.dispose())

async function effect(env: Record<string, string>, ...argv: string[]) {
  const output = new FakeOutput()
  const code = await (await buildContainer({ ...box.env(), ...env } as CliEnvironment, { output })).run(["patches", "effect", ...argv])
  return { code, out: output.text() }
}

describe("effect, from Magic Context's log since the OpenCode server started", () => {
  it.skipIf(onlyOn("linux"))("is respected when, since the server started, nothing was rejected and the floor is threshold − 2 (linux only)", async () => {
    box.threshold(13)
    box.log([rejected(10), floor(20, 63), "garbage line", floor(200, 11), floor(300, 11)])
    const proc = box.proc(BOOT, 100)
    const result = await effect({ OPENCODE_SESSION_MANAGER_PATCHES_PROC: proc })
    expect(result).toEqual({
      code: 0,
      out: [
        `log: ${path.join(box.tmp, "opencode2", "magic-context", "magic-context.log")}`,
        `since: ${at(100)} (2 lines)`,
        "configured execute_threshold_percentage: 13",
        "rejections of execute_threshold_percentage: 0",
        "proactive floors logged: 11% ×2",
        "threshold in use: 13%",
        "verdict: respected",
      ].join("\n"),
    })
  })

  it.skipIf(onlyOn("linux"))("is rejected when the value was refused after the server started, and --since overrides the start (linux only)", async () => {
    box.threshold(13)
    box.log([rejected(150), floor(160, 63)])
    const proc = box.proc(BOOT, 100)
    const result = await effect({ OPENCODE_SESSION_MANAGER_PATCHES_PROC: proc })
    expect([result.code, result.out.split("\n").at(-1)]).toEqual([1, "verdict: rejected"])
    const later = await effect({ OPENCODE_SESSION_MANAGER_PATCHES_PROC: proc }, "--since", at(155), "--json")
    expect(JSON.parse(later.out).verdict).toBe("differs")
  })

  it.skipIf(onlyOn("linux"))("reads every line when no server runs, and knows nothing without a log or configuration (linux only)", async () => {
    const proc = path.join(box.home, "proc-idle")
    write(path.join(proc, "stat"), `btime ${BOOT}\n`)
    write(path.join(proc, "5", "cmdline"), "/usr/bin/opencode\0serve\0")
    write(path.join(proc, "6", "cmdline"), "/usr/bin/zsh\0")
    const result = await effect({ OPENCODE_SESSION_MANAGER_PATCHES_PROC: proc })
    expect(result.out.split("\n").slice(1)).toEqual([
      "since: (all lines) (0 lines)",
      "configured execute_threshold_percentage: (not set)",
      "rejections of execute_threshold_percentage: 0",
      "proactive floors logged: (none yet)",
      "threshold in use: (unknown yet)",
      "verdict: no-data",
    ])
    const noBoot = path.join(box.home, "proc-noboot")
    write(path.join(noBoot, "stat"), "cpu 1\n")
    box.log([rejected(1)])
    const last = await effect({ OPENCODE_SESSION_MANAGER_PATCHES_PROC: noBoot })
    expect(last.out).toContain(`  last: ${rejected(1)}`)
  })
})
